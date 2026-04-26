# 活動功能性偶合關聯圖規格（Temporal Functional Coupling Graph）

版本：v1.1  
日期：2026-04-26  
適用系統：OGSM Power Tool

---

## 1. 目的與決策問題

本文件定義一套可運算、可追溯、可時間查詢的活動關聯演算法，用於回答以下管理問題：

1. 哪些活動在功能上互相偶合，應一起規劃或檢討。
2. 偶合成立的原因是哪些標籤（tag），各自貢獻多少。
3. 偶合是否跨部門，且在不同時間點是否仍成立。
4. 在串接優惠券、預算、成效資料後，哪些活動群是主要績效驅動來源。

核心原則：

- 關聯是可計算的，不是人工主觀連線。
- 關聯是時間化事實，不是靜態常數。
- 每條關聯都要可解釋與可追溯。

---

## 2. 範圍與非範圍

### 2.1 範圍（In Scope）

1. 以活動與標籤為主體建立偶合邊。
2. 支援 as-of 時點查詢與時間窗查詢。
3. 支援跨部門活動比較與群聚。
4. 支援後續整合優惠券、預算、成效作為關聯強度修正項。

### 2.2 非範圍（Out of Scope）

1. 不在 v1 直接引入外部圖資料庫（先採前端/服務端可計算模型）。
2. 不在 v1 建立因果推論模型（先做關聯，不直接宣稱因果）。
3. 不在 v1 以 LLM 自動推導 tag（先以受控字典為主）。

---

## 3. 名詞定義

- 活動：最小管理單元，記為 $a \in \mathcal{A}$。
- 標籤：受控字典標籤，記為 $t \in \mathcal{T}$。
- 有效期間：事實為真的時間區間，記為 $[v_{from}, v_{to})$。
- Episode：事件來源（新增活動、加標籤、改名、停用等）。
- 偶合邊：活動間關聯，記為 $e_{ij}$，其中 $i,j$ 為活動索引。

---

## 4. 資料模型

### 4.1 基本實體

1. Activity
   - activity_id
   - global_id（建議：dept_id + ":" + activity_id）
   - dept_id
   - tags
   - status
   - start_date, end_date

2. TagDictionary
   - tag_id
   - tag_name
   - tag_type（func, mech, aud, chn, time, res...）
   - status（active, disabled）
   - aliases

3. Episode
   - episode_id
   - ts_event
   - actor
   - event_type
   - payload

### 4.2 時間化關聯儲存（建議邏輯表）

ActivityTagFact：

- activity_global_id
- tag_id
- valid_from
- valid_to（null 表示仍有效）
- source_episode_id

ActivityCouplingFact：

- src_activity_global_id
- dst_activity_global_id
- as_of
- coupling_score
- evidence（共同 tag 與各 tag 貢獻）

---

## 5. 時間語義

### 5.1 事實有效條件

在時間 $\tau$，活動 $a$ 與標籤 $t$ 的關係是否成立：

$$
I_{a,t}(\tau)=
\begin{cases}
1, & v_{from}(a,t) \le \tau < v_{to}(a,t) \\
0, & \text{otherwise}
\end{cases}
$$

### 5.2 「現在」與「歷史」

- Now 查詢：$\tau = now$
- As-of 查詢：任意指定 $\tau$
- Window 查詢：$\tau \in [\tau_1, \tau_2]$，可用平均或峰值聚合

---

## 6. 偶合分數演算法

### 6.1 基礎集合與符號

在時間 $\tau$：

$$
\mathcal{C}_{ij}(\tau)=\{t \mid I_{i,t}(\tau)=1 \land I_{j,t}(\tau)=1\}
$$

$$
\mathcal{U}_{ij}(\tau)=\{t \mid I_{i,t}(\tau)=1 \lor I_{j,t}(\tau)=1\}
$$

### 6.2 標籤基礎權重與稀有度權重

每個標籤設定基礎權重 $w_t$（由 tag_type 定義），並加入稀有度權重 $idf_t$：

$$
idf_t=\log\left(\frac{N+1}{df_t+1}\right)+1
$$

其中 $N$ 為活動總數，$df_t$ 為擁有標籤 $t$ 的活動數。此項可降低高頻標籤造成的圖過密問題。

### 6.3 時間衰減項（明確定義）

對活動 $a$ 與標籤 $t$，定義最近一次該標籤有效變更時間為 $u_{a,t}$。對活動對 $(i,j)$：

$$
u_{ij,t}=\min(u_{i,t},u_{j,t})
$$

$$
\Delta t_{ij,t}(\tau)=\max(0,\tau-u_{ij,t})
$$

$$
D_{ij,t}(\tau)=e^{-\lambda_t \Delta t_{ij,t}(\tau)}
$$

此定義表示「雙方都成立的最近共同證據」距離目前多久，語義固定且可實作。

### 6.4 v1 主公式：IDF 加權 Weighted Jaccard

$$
S^{tag}_{ij}(\tau)=
\frac{\sum_{t \in \mathcal{C}_{ij}(\tau)} w_t\cdot idf_t\cdot D_{ij,t}(\tau)}{\sum_{t \in \mathcal{U}_{ij}(\tau)} w_t\cdot idf_t\cdot D'_{ij,t}(\tau)+\epsilon}
$$

其中：

- 對交集標籤，$D'_{ij,t}(\tau)=D_{ij,t}(\tau)$。
- 對僅出現在單邊的聯集標籤，$D'_{ij,t}(\tau)$ 取該活動自身衰減 $e^{-\lambda_t(\tau-u_{a,t})}$。

此設計相較 Cosine 在「每活動標籤上限小」時有較佳區分力。

### 6.5 跨資料域強化項（定義先行，可逐步開啟）

最終分數：

$$
S^{final}_{ij}(\tau)=
\alpha S^{tag}_{ij}(\tau)
+\beta S^{coupon}_{ij}(\tau)
+\gamma S^{budget}_{ij}(\tau)
+\delta S^{outcome}_{ij}(\tau)
$$

約束：$\alpha+\beta+\gamma+\delta=1$。

各項建議定義：

1. 優惠券偶合分數

$$
S^{coupon}_{ij}=0.6\cdot Jaccard(C_i,C_j)+0.4\cdot Spearman(\tilde{R}_i,\tilde{R}_j)
$$

- $C_i$：活動 $i$ 的券機制集合（類型/門檻/折抵規則）
- $\tilde{R}_i$：依第 6.6 節對齊後的兌換率時間序列

2. 預算耦合分數

$$
S^{budget}_{ij}=Cosine(\mathbf{b}_i,\mathbf{b}_j)
$$

- $\mathbf{b}_i$：活動 $i$ 在統一時間粒度（週或月）下的預算向量

3. 成效耦合分數

$$
S^{outcome}_{ij}=Spearman(\tilde{\mathbf{y}}_i,\tilde{\mathbf{y}}_j)
$$

- $\tilde{\mathbf{y}}_i$：重採樣且對齊後的成效序列（例如轉換率、營收、LTV 代理指標）

v1 建議：$\alpha=1,\beta=\gamma=\delta=0$。但三項定義須先固定，避免後續整合時語義漂移。

### 6.6 時間序列對齊規則（鎖定）

為避免活動期間長度不一致導致分數漂移，所有時間序列相似度（$S^{coupon}$、$S^{budget}$、$S^{outcome}$）一律採以下規則：

1. 共同觀測窗：

$$
W_{ij}=W_i \cap W_j=[\max(s_i,s_j),\min(e_i,e_j)]
$$

2. 只在 $W_{ij}$ 內重採樣並比較；不採補零（zero padding）。
3. 若共同觀測點數 $|W_{ij}|<L_{min}$，則該子分數標記為缺失（NA），預設 $L_{min}=4$（以週粒度時）。
4. 最終分數採可用項重正規化：

$$
S^{final}_{ij}(\tau)=\frac{\sum_{k \in \mathcal{K}_{ij}} \omega_k S^k_{ij}(\tau)}{\sum_{k \in \mathcal{K}_{ij}} \omega_k}
$$

其中 $\mathcal{K}_{ij}$ 為非缺失子分數集合，$\omega_k \in \{\alpha,\beta,\gamma,\delta\}$。

---

## 7. 邊建立規則與可視化映射

### 7.1 建邊門檻（分佈校正）

$$
E_{ij}(\tau)=
\begin{cases}
1, & S^{final}_{ij}(\tau) \ge \theta_q \\
0, & \text{otherwise}
\end{cases}
$$

門檻不採固定常數，改以分數分佈分位數設定：

- 弱關聯：$\theta_{85}=P_{85}(S^{final})$
- 中關聯：$\theta_{93}=P_{93}(S^{final})$
- 強關聯：$\theta_{97}=P_{97}(S^{final})$

每次資料更新後重新估計分位數，可避免不同資料規模造成過濾失真。

### 7.2 視覺映射

1. 邊粗細：與 $S^{final}$ 成正比
2. 邊顏色：弱/中/強分層
3. 邊 tooltip：列出前 N 個貢獻最高 tag 與貢獻值
4. 節點顏色：dept 維度，不與邊語義混淆

---

## 8. 可解釋性（Why this edge）

對任一邊 $(i,j)$，輸出分解：

$$
contrib_{ij,t}(\tau)=\frac{w_t\cdot idf_t\cdot D_{ij,t}(\tau)}{\sum_{u \in \mathcal{C}_{ij}(\tau)} w_u\cdot idf_u\cdot D_{ij,u}(\tau)+\epsilon}
$$

輸出格式建議：

- edge_id
- as_of
- score_final
- top_reasons
  - tag
  - raw_weight
  - decay
  - contribution_ratio
- episodes

這可直接支援「關聯原因卡」。

---

## 9. 跨部門處理策略

### 9.1 可行性

多部門資料可先彙整為單一 effective workspace 後計算（現有架構已具備）。

### 9.2 關鍵要求

1. global_id 一致且不碰撞
2. 部門變更保留歷史 episode
3. 跨部門邊可加懲罰或增益項（可選）：

$$
S'_{ij}(\tau)=S^{final}_{ij}(\tau)\cdot M_{dept}(i,j)
$$

其中 $M_{dept}$ 可設：

- 同部門：1.00
- 跨部門：0.95（輕微懲罰，降低噪音）

若組織希望強化跨部門協作，可反向設定跨部門增益。

---

## 10. 增量更新演算法

### 10.0 Episode 寫入管線（先於演算法）

為確保 provenance 可驗證，所有異動需先經統一事件管線：

1. 前端 mutation handler 接收活動或標籤異動。
2. 先寫入 append-only EpisodeLog（含 actor、timestamp、before/after、source）。
3. 以 episode_id 觸發快照更新（ActivityTagFact/TagDictionary）。
4. 再觸發 coupling 增量重算並把結果綁定 episode_id。

未經 EpisodeLog 的資料改動視為非合規，不得進入關聯計算。

### 10.0.1 旁路寫入偵測與 reconciliation

為處理 bug 或人工直接改資料造成的旁路更新，系統需執行定期一致性檢查：

1. 每日 reconciliation job 比對「現況快照」與「Episode replay 重建快照」。
2. 若 diff 非空，產生 `integrity_incident` 並標記受影響活動為 `provenance_untrusted`。
3. 在關聯圖 UI 對受影響邊顯示資料完整性警示，不進入正式決策報表。
4. 提供修復流程：補寫 Episode 或回滾快照，修復後重算 coupling。

### 10.1 事件驅動更新

當活動 $a$ 標籤變更時，只需重算與 $a$ 有機會相交的活動集合 $\mathcal{N}(a)$：

1. 由倒排索引 tag -> activity_set 取候選
2. 計算候選邊新分數
3. 更新/失效邊快取

### 10.2 複雜度

- 全量重算：$O(|\mathcal{A}|^2 \cdot \bar{k})$
- 倒排索引增量：$O(|\mathcal{N}(a)| \cdot \bar{k})$

其中 $\bar{k}$ 為平均 tag 數。

---

## 11. 參數預設（v1 建議）

1. 每活動 tag 上限：5
2. 主公式：IDF 加權 Weighted Jaccard（$S^{tag}$）
3. 公式主項：僅 tag（$\alpha=1$）
4. 衰減半衰期：
   - func: 180 天
   - mech: 120 天
   - aud: 150 天
   - chn: 90 天
   - time: 45 天
5. 邊顯示門檻：採分位數（$P_{85},P_{93},P_{97}$）
6. 預設只顯示前 300 條最高分邊（避免圖過載）

衰減係數可由半衰期 $h_t$ 換算：

$$
\lambda_t=\frac{\ln 2}{h_t}
$$

---

## 12. 風險與治理

1. Tag 品質風險：
   - 需受控字典與類別治理
   - 停用標籤不立即刪除歷史，只設 valid_to

2. 偶合誤解風險：
   - 關聯不等於因果
   - UI 必須顯示「關聯原因與來源事件」

3. 資料漂移風險：
   - 定期校正權重與門檻
   - 追蹤圖密度與解釋覆蓋率

4. Provenance 信任風險：
   - 需啟用第 10.0.1 節的 reconciliation 機制
   - `provenance_untrusted` 活動不得納入正式評估指標

---

## 13. 驗證指標

1. 結構指標
   - 圖密度
   - 平均度數
   - 跨部門邊比例

2. 解釋指標
   - 邊可解釋率（有 top reasons 的邊比例）
   - episode 可追溯率

3. 業務指標
   - 會議前置分析時間
   - 跨部門協調 lead time
   - 高偶合群組成效穩定度

### 13.1 量測基線與期間

1. 基線窗：功能上線前連續 4 週。
2. 評估窗：上線後每 4 週滾動評估。
3. 所有業務指標均以「中位數」為主統計量，以降低極端值影響。

### 13.2 會議前置分析時間（可量測定義）

1. 事件定義：從「會議建立（agenda_created_at）」到「分析包送出（analysis_pack_sent_at）」。
2. 指標：

$$
T_{prep}=median(analysis\_pack\_sent\_at - agenda\_created\_at)
$$

3. 改善率：

$$
Improve_{prep}=\frac{T^{baseline}_{prep}-T^{current}_{prep}}{T^{baseline}_{prep}}
$$

### 13.3 跨部門協調 lead time（可量測定義）

1. 事件定義：從「跨部門議題建立（coord_issue_created_at）」到「對齊決議完成（alignment_decision_at）」。
2. 指標：

$$
T_{coord}=median(alignment\_decision\_at - coord\_issue\_created\_at)
$$

3. 改善率：

$$
Improve_{coord}=\frac{T^{baseline}_{coord}-T^{current}_{coord}}{T^{baseline}_{coord}}
$$

### 13.4 高偶合群組成效穩定度

1. 取強關聯群組（$\theta_{97}$）作為觀測集合。
2. 指標採變異係數（Coefficient of Variation）：

$$
CV_{outcome}=\frac{\sigma(Outcome_{group})}{\mu(Outcome_{group})+\epsilon}
$$

3. 目標為在不降低平均成效下，降低 $CV_{outcome}$。

---

## 14. 實作路線圖

### Phase A（立即）

1. 補 global_id
2. 定義並落地 episode 寫入管線（append-only）
3. 實作 tag-based coupling score（as-of）
4. 關聯圖加原因卡與門檻滑桿

### Phase B（次階段）

1. 加 time slider
2. 加 window aggregation
3. 加跨部門濾鏡

### Phase C（資料整合）

1. 接優惠券資料
2. 接預算資料
3. 接成效資料
4. 開啟 $\beta,\gamma,\delta$ 權重項

---

## 15. Graphiti 概念參照（非同架構）

本規格僅借鏡 Graphiti 的概念層精神，不宣稱採用其完整技術架構。本規格借鏡的核心精神為：

1. Temporal Fact Management：事實有有效期間，可查現在與歷史。
2. Episodes & Provenance：每條關聯可回追來源事件。
3. Incremental Graph Construction：事件來就增量更新，不需全量重算。

本系統目前為「時間化加權相似圖」路線：

- 標籤由受控字典維護
- 關聯由數學公式計算
- 以現有 workspace 與快照資料進行增量更新

Graphiti 典型路線（供比較）則包含：

- 以 LLM 從 episode 自動抽取 entity/relationship
- 寫入圖資料庫（如 Neo4j/FalkorDB）
- 以 keyword + semantic + graph traversal 的 hybrid retrieval 查詢

若後續決定轉向 Graphiti 類架構，需新增：LLM 抽取層、圖儲存層、混合檢索層與 schema governance。

---

## 16. 附錄：最小輸出資料格式（供 UI）

EdgePayload 建議：

- src_global_id
- dst_global_id
- as_of
- score
- level（weak, medium, strong）
- reasons[]
  - tag_id
  - tag_name
  - contribution
  - weight
  - decay
- provenance[]
  - episode_id
  - event_type
  - ts_event

此輸出可直接驅動：

1. 關聯圖邊樣式
2. 邊點選後原因卡
3. 時間軸回放模式
