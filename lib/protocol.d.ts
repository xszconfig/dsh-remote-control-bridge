/**
 * Wire protocol types shared between the bridge plugin and the mobile client.
 * Pure JSON shapes — no dsh types here so the mobile side can mirror them 1:1.
 */
export type AgentStatusWire = 'idle' | 'running';
export interface SessionSummary {
    id: string;
    /** Desktop display title: durable title, cwd basename, then id. */
    name: string;
    cwd: string;
    /** Workspace this session belongs to; null = ungrouped. */
    workspaceId: string | null;
    status: AgentStatusWire;
    agentCount: number;
    subagentCount: number;
    updatedAt: number;
    /** 子代理会话所属的主会话 id；缺省 = 顶层（用户手动创建的）会话。 */
    parentSessionId?: string;
}
export interface WorkspaceSummary {
    id: string;
    title: string;
    path: string;
    sessionCount: number;
}
export interface AgentSummary {
    sessionId: string;
    role: 'primary' | 'subagent';
    status: AgentStatusWire;
    depth: number;
}
export type EventKind = 'user_message' | 'assistant_message' | 'tool_call' | 'tool_result' | 'think' | 'error' | 'system';
export interface EventProjection {
    seq: number;
    type: EventKind;
    text?: string;
    toolName?: string;
    toolArgs?: string;
    toolResult?: string;
    toolError?: boolean;
    timestamp: number;
    /** 工具调用/结果关联 id：客户端据此把失败的命令标红。 */
    callId?: string;
    /** 工具调用卡片形态（桌面端 presentCall 同源）：terminal=命令卡，generic/diff=通用卡。 */
    toolCard?: string;
    /** 工具调用的一行描述（桌面端 ToolCallView.title；Bash 即命令文本）。 */
    toolDesc?: string;
    /** 工具类别（read/edit/delete/move/search/execute/fetch/other），客户端选图标。 */
    toolKind?: string;
}
export interface ApprovalRequestWire {
    approvalId: string;
    sessionId: string;
    toolName: string;
    /** 关联的工具调用 id（有则透传，客户端可定位对应命令）。 */
    callId?: string;
    /** 请求方的可读理由（桌面端主文案来源）。 */
    reason?: string;
    /** 关联工具调用时提取的命令文本（如 bash 命令），无则缺省。 */
    command?: string;
    /** 服务端请求时间（epoch ms）。 */
    requestedAt: number;
    /**
     * 由桌面端 apiproxy 持有（bridge 未认领）时的 mux rpcId：手机裁决走
     * `answer_approval` 命令（经 /api/respond）。缺省 = 本 bridge 持有，走 `approve`。
     */
    rpcId?: string;
}
export interface QuestionOptionWire {
    label: string;
    description?: string;
}
export interface QuestionItemWire {
    id: string;
    question: string;
    header?: string;
    detail?: string;
    options?: QuestionOptionWire[];
    multiSelect?: boolean;
}
export interface QuestionRequestWire {
    rpcId: string;
    sessionId: string;
    questions: QuestionItemWire[];
    requestedAt: number;
}
export interface QuestionAnswerItemWire {
    id: string;
    selected: string[];
    custom?: string;
}
export interface CmdSubscribe {
    type: 'subscribe';
    sessionId?: string;
}
export interface CmdSendMessage {
    type: 'send_message';
    sessionId: string;
    text: string;
}
export interface CmdInterrupt {
    type: 'interrupt';
    sessionId: string;
}
export interface CmdApprove {
    type: 'approve';
    approvalId: string;
    decision: 'allowed-once' | 'rejected';
}
/** 裁决桌面端持有的审批（mux rpcId → /api/respond）。 */
export interface CmdAnswerApproval {
    type: 'answer_approval';
    rpcId: string;
    sessionId: string;
    approvalId: string;
    decision: 'allowed-once' | 'rejected';
}
/** 回答桌面端持有的提问（mux rpcId → /api/respond）。 */
export interface CmdAnswerQuestion {
    type: 'answer_question';
    rpcId: string;
    sessionId: string;
    answers: QuestionAnswerItemWire[];
}
export interface CmdList {
    type: 'list';
}
/** 历史分页：拉取 seq < beforeSeq 的最近一页（最多 limit 条）。 */
export interface CmdHistoryPage {
    type: 'history_page';
    sessionId: string;
    beforeSeq: number;
    limit?: number;
}
/** 排队消息操作：steer = 插队（作为 steering 注入当前轮）；remove = 移除。 */
export interface CmdQueueAction {
    type: 'queue_action';
    sessionId: string;
    itemId: string;
    action: 'steer' | 'remove';
}
/** 手机回传本地结构化连接日志（桌面端 /remote/phone-logs 拉取）。 */
export interface LogEntryWire {
    ts: number;
    level: string;
    tag: string;
    message: string;
}
export interface CmdUploadLogs {
    type: 'upload_logs';
    requestId: string;
    entries: LogEntryWire[];
}
/** Pair a phone with the desktop: exchange a long-lived per-device token. */
export interface CmdRegisterDevice {
    type: 'register_device';
    deviceId: string;
    name: string;
    model?: string;
}
/** Revoke a previously registered device token. */
export interface CmdRevokeDevice {
    type: 'revoke_device';
    deviceId: string;
}
export type ClientCommand = CmdSubscribe | CmdSendMessage | CmdInterrupt | CmdApprove | CmdAnswerApproval | CmdAnswerQuestion | CmdList | CmdHistoryPage | CmdQueueAction | CmdUploadLogs | CmdRegisterDevice | CmdRevokeDevice;
export interface EvHello {
    type: 'hello';
    version: string;
    /** Stable per-machine fingerprint of this DeepSeek Harness host. */
    serverId: string;
    /** OS hostname of the desktop, used as the default device name. */
    hostname: string;
    sessions: SessionSummary[];
    agents: AgentSummary[];
    /** Workspaces in durable registry order. */
    workspaces: WorkspaceSummary[];
    /** 当前由本 bridge 持有、等待手机裁决的审批（连接/重连时补发）。 */
    pendingApprovals: ApprovalRequestWire[];
    /** 桌面端持有、bridge 经 mux 转发的审批（手机裁决走 answer_approval）。 */
    pendingRemoteApprovals: ApprovalRequestWire[];
    /** 桌面端持有、bridge 经 mux 转发的提问（手机回答走 answer_question）。 */
    pendingQuestions: QuestionRequestWire[];
}
export interface EvSessions {
    type: 'sessions';
    sessions: SessionSummary[];
}
export interface EvAgents {
    type: 'agents';
    agents: AgentSummary[];
}
export interface EvEvent {
    type: 'event';
    sessionId: string;
    event: EventProjection;
}
export interface EvAgentStatus {
    type: 'agent_status';
    sessionId: string;
    status: AgentStatusWire;
}
export interface EvApprovalRequest {
    type: 'approval_request';
    approval: ApprovalRequestWire;
}
export interface EvApprovalResolved {
    type: 'approval_resolved';
    approvalId: string;
    sessionId: string;
    outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
}
export interface EvQuestionRequest {
    type: 'question_request';
    question: QuestionRequestWire;
}
export interface EvQuestionResolved {
    type: 'question_resolved';
    rpcId: string;
    sessionId: string;
    outcome: 'answered' | 'cancelled';
}
export interface EvHistory {
    type: 'history';
    sessionId: string;
    events: EventProjection[];
    /** 该会话当前排队的消息（inbox 投影）；缺省 = 无排队。 */
    queue?: QueueItemWire[];
    /** 是否还有更早的历史可翻页（history_page 继续加载）。 */
    hasMore?: boolean;
    /** 会话事件总数（展示用）。 */
    total?: number;
}
/** 排队消息投影：placement = queued(下一轮)/steering(用户插队中)/context(系统注入)。 */
export interface QueueItemWire {
    id: string;
    placement: 'queued' | 'steering' | 'context';
    text: string;
}
export interface EvSessionQueue {
    type: 'session_queue';
    sessionId: string;
    items: QueueItemWire[];
}
/** 桌面端请求手机回传本地日志（经 /remote/phone-logs 触发）。 */
export interface EvLogsRequest {
    type: 'logs_request';
    requestId: string;
}
/** 该会话的模型请求开始（Deep Diving 指示）。 */
export interface EvModelWaiting {
    type: 'model_waiting';
    sessionId: string;
    startedAt: number;
}
/** 该会话的模型请求完成。 */
export interface EvModelWaitingDone {
    type: 'model_waiting_done';
    sessionId: string;
    startedAt: number;
    elapsedMs: number;
}
/** 思考流式增量（reasoning-delta 累积，节流广播；text 为空 = 清除实时思考行）。 */
export interface EvThinkDelta {
    type: 'think_delta';
    sessionId: string;
    text: string;
}
/** A session's durable title changed (user rename or automatic generation). */
export interface EvSessionTitle {
    type: 'session_title';
    sessionId: string;
    title: string;
}
/** 会话列表增量：新建/下线的会话行（含冷会话首次可见时由 hello 全量对账）。 */
export interface EvSessionUpsert {
    type: 'session_upsert';
    session: SessionSummary;
}
export interface EvError {
    type: 'error';
    code: string;
    message: string;
}
/** Answer to register_device: the phone stores this token for reconnects. */
export interface WireEndpoint {
    host: string;
    port: number;
}
export interface EvDeviceRegistered {
    type: 'device_registered';
    deviceId: string;
    deviceToken: string;
    serverId: string;
    hostname: string;
    /** 手机可达的候选端点（127.0.0.1 + 局域网/Tailscale IP，供多路由重连）。 */
    endpoints: WireEndpoint[];
}
export interface EvDeviceRevoked {
    type: 'device_revoked';
    deviceId: string;
}
export type ServerEvent = EvHello | EvSessions | EvAgents | EvEvent | EvHistory | EvSessionQueue | EvLogsRequest | EvModelWaiting | EvModelWaitingDone | EvThinkDelta | EvSessionTitle | EvSessionUpsert | EvAgentStatus | EvApprovalRequest | EvApprovalResolved | EvQuestionRequest | EvQuestionResolved | EvError | EvDeviceRegistered | EvDeviceRevoked;
export interface PingInfo {
    ok: true;
    version: string;
    serverId: string;
    hostname: string;
    sessions: number;
}
/** Payload embedded in the pairing QR code (scanned by the phone). */
export interface PairQrPayload {
    v: 1;
    t: 'dsh-remote';
    serverId: string;
    hostname: string;
    expiresAt: number;
    /** Candidate ws URLs, most-preferred first. */
    urls: string[];
}
export interface PairInfo extends PairQrPayload {
    bindHost: '127.0.0.1' | '0.0.0.0';
    port: number;
}
export interface DeviceRecord {
    deviceId: string;
    name: string;
    model?: string;
    createdAt: number;
    lastSeenAt: number;
}
export declare const BRIDGE_VERSION = "0.10.8";
