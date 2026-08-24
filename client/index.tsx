/**
 * dsh-remote-control-bridge 的 Web 客户端半边：
 * 在侧边栏脚部（设置旁）挂一个「连接移动端」入口，弹窗内展示配对二维码
 * 与实时连接状态（当前连接了哪台手机）。
 */
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import qrcode from 'qrcode-generator'

// ---- client 服务注入 ----
export const inject = ['slots'] as const

interface PairInfo {
  v: number
  t: string
  serverId?: string
  hostname?: string
  expiresAt: number
  urls: string[]
}

interface ConnectedDevice {
  deviceId: string
  name: string
  model?: string
  connectedAt: number
}

const POLL_MS = 2_000

async function fetchPairInfo(): Promise<PairInfo> {
  const res = await fetch('/remote/pair-info')
  if (!res.ok) throw new Error(`pair-info ${res.status}`)
  return (await res.json()) as PairInfo
}

async function fetchConnected(): Promise<ConnectedDevice[]> {
  const res = await fetch('/remote/connected')
  if (!res.ok) return []
  return (await res.json()) as ConnectedDevice[]
}

function buildQrSvg(info: PairInfo): string {
  const payload = JSON.stringify({
    v: 1,
    t: 'dsh-remote',
    serverId: info.serverId,
    hostname: info.hostname,
    expiresAt: info.expiresAt,
    urls: info.urls,
  })
  const qr = qrcode(0, 'M')
  qr.addData(payload)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
}

export function apply(ctx: { slots: SlotsFace }): void {
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'mobile-pair',
      },
      MobilePairButton,
    ),
  )
}

// ---- 极简 slots 类型面（本插件只用 inject/register） ----
interface SlotsFace {
  inject(slot: string, registration: () => unknown): void
  register(options: { name: string; id?: string }, component: React.ComponentType<any>): unknown
}

// ================= 入口按钮 =================

function MobilePairButton({ wide }: { wide?: boolean }) {
  const [open, setOpen] = useState(false)
  const [connectedCount, setConnectedCount] = useState(0)

  useEffect(() => {
    if (!open) return
    let alive = true
    const tick = async () => {
      try {
        const devices = await fetchConnected()
        if (alive) setConnectedCount(devices.length)
      } catch {
        /* 忽略轮询失败 */
      }
    }
    tick()
    const timer = window.setInterval(tick, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className="rcp-trigger"
        data-wide={wide ? 'true' : 'false'}
        title="连接移动端"
        aria-label="连接移动端"
        onClick={() => setOpen(true)}
      >
        <span className="rcp-trigger-icon" aria-hidden>
          📱
        </span>
        {wide ? <span className="rcp-trigger-label">连接移动端</span> : null}
        {connectedCount > 0 ? <span className="rcp-trigger-dot" /> : null}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="连接移动端"
        closeLabel="关闭"
        description="扫描二维码，把手机连接到这台 DeepSeek Harness"
      >
        <PairPanel onConnectedCount={setConnectedCount} />
      </Modal>
      <style>{css}</style>
    </>
  )
}

// ================= 弹窗主体 =================

function PairPanel({ onConnectedCount }: { onConnectedCount: (n: number) => void }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'connected'>('loading')
  const [pair, setPair] = useState<PairInfo | null>(null)
  const [error, setError] = useState('')
  const [devices, setDevices] = useState<ConnectedDevice[]>([])
  const [pairing, setPairing] = useState(false)

  const svg = useMemo(() => (pair ? buildQrSvg(pair) : ''), [pair])

  const refresh = async (silent: boolean) => {
    try {
      const info = await fetchPairInfo()
      setPair(info)
      setPhase((cur) => (cur === 'connected' ? cur : 'ready'))
    } catch (e) {
      if (!silent) {
        setPhase('error')
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }

  useEffect(() => {
    setPhase('loading')
    setPairing(false)
    refresh(false)
    let alive = true
    let pending = false
    const poll = async () => {
      if (pending) return
      pending = true
      try {
        const list = await fetchConnected()
        if (!alive) return
        setDevices(list)
        onConnectedCount(list.length)
        if (list.length > 0) setPhase('connected')
        else setPhase((cur) => (cur === 'connected' ? 'ready' : cur))
      } catch {
        /* 忽略 */
      } finally {
        pending = false
      }
    }
    poll()
    const timer = window.setInterval(poll, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [onConnectedCount])

  // 二维码到期自动刷新
  useEffect(() => {
    if (!pair || phase === 'connected') return
    const left = pair.expiresAt - Date.now()
    if (left <= 0) {
      refresh(true)
      return
    }
    const timer = window.setTimeout(() => refresh(true), Math.max(left - 3_000, 1_000))
    return () => window.clearTimeout(timer)
  }, [pair, phase])

  if (phase === 'loading') {
    return <div className="rcp-state">生成二维码中…</div>
  }
  if (phase === 'error') {
    return (
      <div className="rcp-state rcp-error">
        <div>无法获取配对信息：{error}</div>
        <button type="button" className="rcp-btn" onClick={() => refresh(false)}>
          重试
        </button>
      </div>
    )
  }
  if (phase === 'connected' && devices.length > 0) {
    return (
      <div className="rcp-connected">
        <div className="rcp-connected-check" aria-hidden>
          ✓
        </div>
        <div className="rcp-connected-title">连接成功</div>
        <div className="rcp-connected-devices">
          {devices.map((d) => (
            <div key={d.deviceId} className="rcp-device-row">
              <span className="rcp-device-dot" />
              <span className="rcp-device-name">{d.name}</span>
              {d.model ? <span className="rcp-device-model">{d.model}</span> : null}
            </div>
          ))}
        </div>
        <div className="rcp-connected-hint">手机断开后会自动回到配对码</div>
        <button
          type="button"
          className="rcp-btn rcp-btn-ghost"
          onClick={() => {
            setPairing(true)
            setPhase('ready')
            refresh(false).finally(() => setPairing(false))
          }}
          disabled={pairing}
        >
          {pairing ? '刷新中…' : '再次配对'}
        </button>
      </div>
    )
  }
  return (
    <div className="rcp-pair">
      <div className="rcp-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="rcp-wait">
        <span className="rcp-wait-dot" />
        等待手机扫码…
      </div>
      <div className="rcp-meta">
        {pair?.hostname ? <span className="rcp-meta-item">🖥 {pair.hostname}</span> : null}
        <span className="rcp-meta-item">有效期 {countdownOf(pair?.expiresAt)}</span>
        <button type="button" className="rcp-link" onClick={() => refresh(false)}>
          刷新
        </button>
      </div>
    </div>
  )
}

function countdownOf(expiresAt?: number): string {
  if (!expiresAt) return '--'
  const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  const m = Math.floor(left / 60)
  const s = left % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ================= 样式 =================

const css = `
.rcp-trigger{
  display:inline-flex;align-items:center;gap:8px;border:none;background:transparent;
  color:var(--dsw-sidebar-fg,#9aa3b8);cursor:pointer;border-radius:8px;
  padding:6px 8px;font-size:13px;line-height:1;position:relative;
}
.rcp-trigger[data-wide="true"]{width:100%;justify-content:flex-start;padding:6px 10px;}
.rcp-trigger:hover{background:var(--dsw-sidebar-hover,rgba(255,255,255,.06));color:var(--dsw-sidebar-fg-active,#e6e9f2);}
.rcp-trigger-icon{font-size:15px;display:inline-flex;align-items:center;}
.rcp-trigger-label{font-weight:500;}
.rcp-trigger-dot{position:absolute;top:4px;right:6px;width:7px;height:7px;border-radius:50%;
  background:#34d399;box-shadow:0 0 6px rgba(52,211,153,.8);}
.rcp-state{padding:18px 8px;text-align:center;color:#9aa3b8;font-size:13px;}
.rcp-error{color:#ff6b6b;}
.rcp-btn{margin-top:10px;border:none;border-radius:8px;padding:7px 16px;cursor:pointer;
  background:#3a5bd9;color:#fff;font-size:13px;}
.rcp-btn:disabled{opacity:.55;cursor:default;}
.rcp-btn-ghost{background:transparent;color:#9aa3b8;border:1px solid #2a3348;}
.rcp-btn-ghost:hover{color:#e6e9f2;}
.rcp-pair{display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0 4px;}
.rcp-qr{background:#fff;border-radius:12px;padding:12px;line-height:0;}
.rcp-qr svg{display:block;width:200px;height:200px;}
.rcp-wait{display:inline-flex;align-items:center;gap:8px;color:#9aa3b8;font-size:13px;}
.rcp-wait-dot{width:8px;height:8px;border-radius:50%;background:#f2c14e;animation:rcp-pulse 1.2s ease-in-out infinite;}
@keyframes rcp-pulse{0%,100%{opacity:.35}50%{opacity:1}}
.rcp-meta{display:flex;align-items:center;gap:14px;color:#6b7280;font-size:12px;flex-wrap:wrap;justify-content:center;}
.rcp-meta-item{display:inline-flex;align-items:center;gap:4px;}
.rcp-link{background:none;border:none;color:#6e9bff;cursor:pointer;font-size:12px;padding:0;}
.rcp-link:hover{text-decoration:underline;}
.rcp-connected{display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 8px 6px;}
.rcp-connected-check{width:52px;height:52px;border-radius:50%;background:rgba(52,211,153,.14);
  color:#34d399;font-size:26px;display:flex;align-items:center;justify-content:center;}
.rcp-connected-title{font-size:16px;font-weight:600;color:#e6e9f2;}
.rcp-connected-devices{display:flex;flex-direction:column;gap:8px;width:100%;max-width:260px;}
.rcp-device-row{display:flex;align-items:center;gap:8px;background:#1e2638;border-radius:10px;padding:10px 12px;}
.rcp-device-dot{width:8px;height:8px;border-radius:50%;background:#34d399;flex:none;}
.rcp-device-name{font-size:13px;font-weight:600;color:#e6e9f2;}
.rcp-device-model{font-size:12px;color:#9aa3b8;margin-left:auto;}
.rcp-connected-hint{font-size:12px;color:#6b7280;}
`
