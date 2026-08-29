/**
 * Wire protocol types shared between the bridge plugin and the mobile client.
 * Pure JSON shapes — no dsh types here so the mobile side can mirror them 1:1.
 */

// ---- data models (s -> c snapshots) ----

export type AgentStatusWire = 'idle' | 'running'

export interface SessionSummary {
  id: string
  /** Desktop display title: durable title, cwd basename, then id. */
  name: string
  cwd: string
  /** Workspace this session belongs to; null = ungrouped. */
  workspaceId: string | null
  status: AgentStatusWire
  agentCount: number
  subagentCount: number
  updatedAt: number
}

export interface WorkspaceSummary {
  id: string
  title: string
  path: string
  sessionCount: number
}

export interface AgentSummary {
  sessionId: string
  role: 'primary' | 'subagent'
  status: AgentStatusWire
  depth: number
}

export type EventKind =
  | 'user_message'
  | 'assistant_message'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'system'

export interface EventProjection {
  seq: number
  type: EventKind
  text?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
  toolError?: boolean
  timestamp: number
}

export interface ApprovalRequestWire {
  approvalId: string
  sessionId: string
  toolName: string
  /** 关联的工具调用 id（有则透传，客户端可定位对应命令）。 */
  callId?: string
  /** 请求方的可读理由（桌面端主文案来源）。 */
  reason?: string
  /** 关联工具调用时提取的命令文本（如 bash 命令），无则缺省。 */
  command?: string
  /** 服务端请求时间（epoch ms）。 */
  requestedAt: number
  /**
   * 由桌面端 apiproxy 持有（bridge 未认领）时的 mux rpcId：手机裁决走
   * `answer_approval` 命令（经 /api/respond）。缺省 = 本 bridge 持有，走 `approve`。
   */
  rpcId?: string
}

// ---- 提问（ask_user_question：桌面 apiproxy 持有，bridge 经 mux 转发到手机）----

export interface QuestionOptionWire {
  label: string
  description?: string
}
export interface QuestionItemWire {
  id: string
  question: string
  header?: string
  detail?: string
  options?: QuestionOptionWire[]
  multiSelect?: boolean
}
export interface QuestionRequestWire {
  rpcId: string
  sessionId: string
  questions: QuestionItemWire[]
  requestedAt: number
}
export interface QuestionAnswerItemWire {
  id: string
  selected: string[]
  custom?: string
}

// ---- client -> server commands ----

export interface CmdSubscribe {
  type: 'subscribe'
  sessionId?: string
}
export interface CmdSendMessage {
  type: 'send_message'
  sessionId: string
  text: string
}
export interface CmdInterrupt {
  type: 'interrupt'
  sessionId: string
}
export interface CmdApprove {
  type: 'approve'
  approvalId: string
  decision: 'allowed-once' | 'rejected'
}
/** 裁决桌面端持有的审批（mux rpcId → /api/respond）。 */
export interface CmdAnswerApproval {
  type: 'answer_approval'
  rpcId: string
  sessionId: string
  approvalId: string
  decision: 'allowed-once' | 'rejected'
}
/** 回答桌面端持有的提问（mux rpcId → /api/respond）。 */
export interface CmdAnswerQuestion {
  type: 'answer_question'
  rpcId: string
  sessionId: string
  answers: QuestionAnswerItemWire[]
}
export interface CmdList {
  type: 'list'
}
/** Pair a phone with the desktop: exchange a long-lived per-device token. */
export interface CmdRegisterDevice {
  type: 'register_device'
  deviceId: string
  name: string
  model?: string
}
/** Revoke a previously registered device token. */
export interface CmdRevokeDevice {
  type: 'revoke_device'
  deviceId: string
}

export type ClientCommand =
  | CmdSubscribe
  | CmdSendMessage
  | CmdInterrupt
  | CmdApprove
  | CmdAnswerApproval
  | CmdAnswerQuestion
  | CmdList
  | CmdRegisterDevice
  | CmdRevokeDevice

// ---- server -> client events ----

export interface EvHello {
  type: 'hello'
  version: string
  /** Stable per-machine fingerprint of this DeepSeek Harness host. */
  serverId: string
  /** OS hostname of the desktop, used as the default device name. */
  hostname: string
  sessions: SessionSummary[]
  agents: AgentSummary[]
  /** Workspaces in durable registry order. */
  workspaces: WorkspaceSummary[]
  /** 当前由本 bridge 持有、等待手机裁决的审批（连接/重连时补发）。 */
  pendingApprovals: ApprovalRequestWire[]
  /** 桌面端持有、bridge 经 mux 转发的审批（手机裁决走 answer_approval）。 */
  pendingRemoteApprovals: ApprovalRequestWire[]
  /** 桌面端持有、bridge 经 mux 转发的提问（手机回答走 answer_question）。 */
  pendingQuestions: QuestionRequestWire[]
}
export interface EvSessions {
  type: 'sessions'
  sessions: SessionSummary[]
}
export interface EvAgents {
  type: 'agents'
  agents: AgentSummary[]
}
export interface EvEvent {
  type: 'event'
  sessionId: string
  event: EventProjection
}
export interface EvAgentStatus {
  type: 'agent_status'
  sessionId: string
  status: AgentStatusWire
}
export interface EvApprovalRequest {
  type: 'approval_request'
  approval: ApprovalRequestWire
}
export interface EvApprovalResolved {
  type: 'approval_resolved'
  approvalId: string
  sessionId: string
  outcome: 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
}
export interface EvQuestionRequest {
  type: 'question_request'
  question: QuestionRequestWire
}
export interface EvQuestionResolved {
  type: 'question_resolved'
  rpcId: string
  sessionId: string
  outcome: 'answered' | 'cancelled'
}
export interface EvHistory {
  type: 'history'
  sessionId: string
  events: EventProjection[]
}
/** A session's durable title changed (user rename or automatic generation). */
export interface EvSessionTitle {
  type: 'session_title'
  sessionId: string
  title: string
}
export interface EvError {
  type: 'error'
  code: string
  message: string
}
/** Answer to register_device: the phone stores this token for reconnects. */
export interface WireEndpoint {
  host: string
  port: number
}
export interface EvDeviceRegistered {
  type: 'device_registered'
  deviceId: string
  deviceToken: string
  serverId: string
  hostname: string
  /** 手机可达的候选端点（127.0.0.1 + 局域网/Tailscale IP，供多路由重连）。 */
  endpoints: WireEndpoint[]
}
export interface EvDeviceRevoked {
  type: 'device_revoked'
  deviceId: string
}

export type ServerEvent =
  | EvHello
  | EvSessions
  | EvAgents
  | EvEvent
  | EvHistory
  | EvSessionTitle
  | EvAgentStatus
  | EvApprovalRequest
  | EvApprovalResolved
  | EvQuestionRequest
  | EvQuestionResolved
  | EvError
  | EvDeviceRegistered
  | EvDeviceRevoked

// ---- REST surfaces ----

export interface PingInfo {
  ok: true
  version: string
  serverId: string
  hostname: string
  sessions: number
}

/** Payload embedded in the pairing QR code (scanned by the phone). */
export interface PairQrPayload {
  v: 1
  t: 'dsh-remote'
  serverId: string
  hostname: string
  expiresAt: number
  /** Candidate ws URLs, most-preferred first. */
  urls: string[]
}

export interface PairInfo extends PairQrPayload {
  bindHost: '127.0.0.1' | '0.0.0.0'
  port: number
}

export interface DeviceRecord {
  deviceId: string
  name: string
  model?: string
  createdAt: number
  lastSeenAt: number
}

export const BRIDGE_VERSION = '0.5.0'
