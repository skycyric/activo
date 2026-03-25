/**
 * SharePoint REST API utilities for OGSM Power Tool.
 * Works when the HTML is opened directly from a SharePoint document library URL.
 * Uses the browser's existing SharePoint session cookie — no OAuth setup required.
 */

export interface SPContext {
  siteUrl: string; // e.g. https://contoso.sharepoint.com/sites/MySite
  dataPath: string; // server-relative path to ogsm_data.json
  folderPath: string; // server-relative folder containing the HTML & data file
}

/** Detect if the page is running on SharePoint and return context info. */
export function detectSP(): SPContext | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  // Must be sharepoint.com or contain /_layouts/ (on-prem)
  if (
    !url.hostname.includes("sharepoint.com") &&
    !url.pathname.includes("/_layouts/")
  ) {
    return null;
  }

  // Detect site root path: /sites/Name, /teams/Name, /personal/Name, or root
  const m = url.pathname.match(
    /^(\/sites\/[^/?#]+|\/teams\/[^/?#]+|\/personal\/[^/?#]+)/,
  );
  const siteRelPath = m ? m[1] : "";
  const siteUrl = url.origin + siteRelPath;

  // Data file lives in the same folder as the HTML file
  const htmlPath = decodeURIComponent(url.pathname);
  const folderPath = htmlPath.substring(0, htmlPath.lastIndexOf("/"));
  const dataPath = folderPath + "/ogsm_data.json";

  return { siteUrl, dataPath, folderPath };
}

/** Escape single quotes for use inside OData string literals. */
function odata(path: string) {
  return path.replace(/'/g, "''");
}

/** GET file metadata (ETag, existence). */
export async function spGetMeta(
  siteUrl: string,
  serverRelativePath: string,
): Promise<{ exists: boolean; etag: string }> {
  const resp = await fetch(
    `${siteUrl}/_api/web/getFileByServerRelativeUrl('${odata(serverRelativePath)}')`,
    {
      headers: { Accept: "application/json;odata=verbose" },
      credentials: "include",
    },
  );
  if (resp.status === 404) return { exists: false, etag: "" };
  if (!resp.ok) throw new Error(`SP meta ${resp.status}`);
  const json = await resp.json();
  return { exists: true, etag: json.d.ETag ?? "" };
}

/** Read file content as text. */
export async function spReadFile(
  siteUrl: string,
  serverRelativePath: string,
): Promise<string> {
  const resp = await fetch(
    `${siteUrl}/_api/web/getFileByServerRelativeUrl('${odata(serverRelativePath)}')/$value`,
    { credentials: "include" },
  );
  if (!resp.ok) throw new Error(`SP read ${resp.status}`);
  return resp.text();
}

/** Fetch SharePoint request digest (needed for write operations). */
async function spDigest(siteUrl: string): Promise<string> {
  const resp = await fetch(`${siteUrl}/_api/contextinfo`, {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      "Content-Length": "0",
    },
    credentials: "include",
  });
  if (!resp.ok) throw new Error(`SP digest ${resp.status}`);
  const json = await resp.json();
  return json.d.GetContextWebInformation.FormDigestValue as string;
}

export class SPConflictError extends Error {
  remoteEtag: string;
  constructor(remoteEtag: string) {
    super("CONFLICT");
    this.name = "SPConflictError";
    this.remoteEtag = remoteEtag;
  }
}

/**
 * Write file content.
 * If expectedEtag is provided and doesn't match remote, throws SPConflictError.
 * Returns the new eTag after successful write.
 */
export async function spWriteFile(
  siteUrl: string,
  serverRelativePath: string,
  content: string,
  expectedEtag: string | null,
): Promise<string> {
  // Conflict check before writing
  if (expectedEtag) {
    const meta = await spGetMeta(siteUrl, serverRelativePath);
    if (meta.exists && meta.etag !== expectedEtag) {
      throw new SPConflictError(meta.etag);
    }
  }

  const digest = await spDigest(siteUrl);

  const resp = await fetch(
    `${siteUrl}/_api/web/getFileByServerRelativeUrl('${odata(serverRelativePath)}')/$value`,
    {
      method: "POST",
      headers: {
        "X-RequestDigest": digest,
        "X-HTTP-Method": "PUT",
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: content,
      credentials: "include",
    },
  );

  if (!resp.ok) throw new Error(`SP write ${resp.status}`);

  const newMeta = await spGetMeta(siteUrl, serverRelativePath);
  return newMeta.etag;
}

/**
 * Create a new file in a SharePoint folder.
 * Returns the new eTag.
 */
export async function spCreateFile(
  siteUrl: string,
  folderServerRelativePath: string,
  fileName: string,
  content: string,
): Promise<string> {
  const digest = await spDigest(siteUrl);

  const resp = await fetch(
    `${siteUrl}/_api/web/getFolderByServerRelativeUrl('${odata(folderServerRelativePath)}')/files/add(overwrite=true,url='${encodeURIComponent(fileName)}')`,
    {
      method: "POST",
      headers: {
        "X-RequestDigest": digest,
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: content,
      credentials: "include",
    },
  );

  if (!resp.ok) throw new Error(`SP create ${resp.status}`);

  const filePath = folderServerRelativePath + "/" + fileName;
  const meta = await spGetMeta(siteUrl, filePath);
  return meta.etag;
}
