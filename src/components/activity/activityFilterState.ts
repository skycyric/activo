export interface ActivityFilterState {
  deptIds: string[];
  teamIds: string[];
  owners: string[];
  frameworks: string[];
  periodIds: string[];
  goalIds: string[];
  strategyIds: string[];
  statuses: string[];
  startFrom: string;
  endTo: string;
  keyword: string;
}

export const EMPTY_ACTIVITY_FILTERS: ActivityFilterState = {
  deptIds: [],
  teamIds: [],
  owners: [],
  frameworks: [],
  periodIds: [],
  goalIds: [],
  strategyIds: [],
  statuses: [],
  startFrom: "",
  endTo: "",
  keyword: "",
};
