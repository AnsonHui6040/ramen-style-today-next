import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import {
  applyAnswer,
  evaluateFlow,
  getFirstActionableQuestion,
  getNextInteractiveQuestion,
  getPreviousInteractiveQuestion,
  questionModel,
  type AnswerDraft,
  type FlowState,
  type OptionId,
  type QuestionId,
} from '@ramen-style/classification-core'

import {
  adaptCandidateForPresentation,
  adaptEligibilityResults,
  type PresentationCandidate,
} from './catalog-adapter.js'
import { deriveFinderProjection } from './finder-adapter.js'
import {
  exclusionLabel,
  optionLabel,
  questionCopy,
} from './presentation-copy.js'
import { pendingQuestionState, togglePendingOption } from './questionnaire.js'
import { composeRuntimeResult } from './runtime.js'
import {
  clearWebState,
  restoreWebState,
  saveWebState,
} from './web-persistence.js'

type Page = 'home' | 'quiz' | 'results' | 'finder'

function pageFromPath(path: string): Page {
  if (path.startsWith('/questionnaire')) return 'quiz'
  if (path.startsWith('/results')) return 'results'
  if (path.startsWith('/finder')) return 'finder'
  return 'home'
}

function pathFor(page: Page) {
  return ({ home: '/', quiz: '/questionnaire', results: '/results', finder: '/finder' })[page]
}

function usePage() {
  const [page, setPageState] = useState<Page>(() => pageFromPath(window.location.pathname))
  useEffect(() => {
    const onPopState = () => setPageState(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const navigate = (next: Page, replace = false) => {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', pathFor(next))
    setPageState(next)
  }
  return { page, navigate }
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand${compact ? ' brand--compact' : ''}`} href="/" onClick={(event) => {
      event.preventDefault()
      window.history.pushState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }}>
      <span className="brand__stamp" aria-hidden="true">麵</span>
      <span><strong>今天，吃哪一碗？</strong><small>RAMEN STYLE FINDER</small></span>
    </a>
  )
}

function HomePage({
  hasProgress,
  completed,
  onStart,
  onContinue,
  onReset,
}: {
  hasProgress: boolean
  completed: boolean
  onStart(): void
  onContinue(): void
  onReset(): void
}) {
  return (
    <main className="home-shell">
      <section className="noren" aria-labelledby="home-title">
        <div className="noren__mark">今日<br />一碗</div>
        <div className="noren__copy">
          <p className="eyebrow">8 QUESTIONS · REAL CLASSIFICATION</p>
          <h1 id="home-title">從口味出發，<br />找到今天的拉麵風格。</h1>
          <p>不是人氣排行。回答八個關於湯、麵與偏好的問題，由真實分類模型計算主要及替代結果。</p>
        </div>
      </section>
      <section className="home-action" aria-label="開始問卷">
        <Brand />
        <div className="bowl-orbit" aria-hidden="true"><span>湯</span></div>
        <div className="home-action__copy">
          <p>大約 2 分鐘</p>
          <h2>{completed ? '上次的結果還在。' : hasProgress ? '接著上次的位置繼續。' : '準備好選今天這一碗？'}</h2>
        </div>
        {hasProgress ? (
          <button className="button button--primary" onClick={onContinue}>
            {completed ? '查看上次結果' : '繼續問卷'}
          </button>
        ) : (
          <button className="button button--primary" onClick={onStart}>開始尋找拉麵風格</button>
        )}
        {hasProgress && (
          <button className="button button--text" onClick={onReset}>重新開始</button>
        )}
        <p className="home-note">結果提供風格參考；排除條件不構成食物安全或醫療保證。</p>
      </section>
    </main>
  )
}

function QuestionnairePage({
  draft,
  flow,
  currentQuestionId,
  onSubmit,
  onBack,
}: {
  draft: AnswerDraft
  flow: FlowState
  currentQuestionId: QuestionId
  onSubmit(questionId: QuestionId, optionIds: readonly OptionId[]): void
  onBack(questionId: QuestionId): void
}) {
  const question = questionModel.questions.find(({ id }) => id === currentQuestionId)
  if (!question) return <ErrorPanel message="找不到目前題目。" />
  const pendingState = pendingQuestionState(currentQuestionId, flow)
  const [pending, setPending] = useState<readonly OptionId[]>(() => (
    draft[currentQuestionId] ?? pendingState.initialUiOptionIds
  ))
  const [message, setMessage] = useState('')

  useEffect(() => {
    setPending(draft[currentQuestionId] ?? pendingState.initialUiOptionIds)
    setMessage('')
  }, [currentQuestionId])

  const interactiveIds = flow.interactiveQuestionIds
  const index = question.order
  const progress = Math.round(((index + 1) / questionModel.questions.length) * 100)
  const allowed = new Set(pendingState.allowedOptionIds)
  const select = (optionId: OptionId) => {
    const next = togglePendingOption(pendingState, pending, optionId)
    setPending(next.optionIds as readonly OptionId[])
    setMessage(next.diagnostics[0]?.message ?? '')
  }
  const next = () => {
    if (pending.length < pendingState.minSelections || pending.length > pendingState.maxSelections) {
      setMessage(`請選擇 ${pendingState.minSelections === pendingState.maxSelections
        ? pendingState.minSelections
        : `${pendingState.minSelections}–${pendingState.maxSelections}`} 個選項。`)
      return
    }
    onSubmit(currentQuestionId, pending)
  }

  return (
    <main className="quiz-shell">
      <header className="topbar"><Brand compact /><span className="step-label">第 {index + 1}／{questionModel.questions.length} 題</span></header>
      <div className="progress-track" aria-label={`問卷進度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
      <section className="question-card" aria-labelledby="question-title">
        <div className="question-heading">
          <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <p className="eyebrow">YOUR BOWL · {question.selection.type === 'multiple' ? `最多選 ${pendingState.maxSelections} 個` : '選擇 1 個'}</p>
            <h1 id="question-title">{questionCopy[currentQuestionId].title}</h1>
            <p>{questionCopy[currentQuestionId].description}</p>
          </div>
        </div>
        <div className="option-grid" role="group" aria-labelledby="question-title">
          {question.options.filter(({ id }) => allowed.has(id)).map((option) => {
            const selected = pending.includes(option.id)
            return (
              <button
                className={`option${selected ? ' option--selected' : ''}`}
                key={option.id}
                aria-pressed={selected}
                onClick={() => select(option.id)}
              >
                <span className="option__indicator" aria-hidden="true">{selected ? '✓' : ''}</span>
                <strong>{optionLabel(currentQuestionId, option.id)}</strong>
              </button>
            )
          })}
        </div>
        <p className="validation" role="alert">{message}</p>
        <footer className="question-actions">
          <button className="button button--secondary" onClick={() => onBack(currentQuestionId)}>上一步</button>
          <button className="button button--primary" onClick={next}>
            {index === interactiveIds.length - 1 ? '完成並看結果' : '下一步'}
          </button>
        </footer>
      </section>
    </main>
  )
}

function CandidateCard({
  candidate,
  label,
}: {
  candidate: PresentationCandidate
  label: string
}) {
  if (candidate.availability === 'unavailable') {
    return (
      <article className="result-card result-card--unavailable">
        <p className="eyebrow">{label}</p>
        <h3>顯示資料尚未提供</h3>
        <p>分類結果已保留，但這個風格目前沒有對應的展示資料。</p>
      </article>
    )
  }
  return (
    <article className="result-card" style={{ '--accent': candidate.accent } as CSSProperties}>
      <div className="result-card__top"><p className="eyebrow">{label}</p><span>{candidate.decision === 'eligible' ? '可推薦' : '已阻擋'}</span></div>
      <h3>{candidate.styleDisplayName}</h3>
      <p>{candidate.shortDescription}</p>
      <dl className="result-facts">
        <div><dt>輪廓</dt><dd>{candidate.coreDisplayName}</dd></div>
        <div><dt>麵型</dt><dd>{candidate.subtypeDisplayName}</dd></div>
        <div><dt>分數</dt><dd>{candidate.score}</dd></div>
        <div><dt>信心</dt><dd>{candidate.confidence === null ? '—' : `${candidate.confidence}%`}</dd></div>
      </dl>
    </article>
  )
}

function ResultsPage({
  draft,
  onRestart,
  onFinder,
}: {
  draft: AnswerDraft
  onRestart(): void
  onFinder(): void
}) {
  const result = composeRuntimeResult(draft)
  if (!result.ok) return <ErrorPanel message={result.message} />
  const presentation = adaptEligibilityResults(result.eligibility)
  const blocked = result.eligibility.blockedCandidates
  return (
    <main className="results-shell">
      <header className="results-hero">
        <Brand compact />
        <div><p className="eyebrow">YOUR RAMEN PROFILE</p><h1>今天，從這一碗開始。</h1><p>以下結果由完整問卷、評分與排除條件檢查產生。</p></div>
      </header>
      {blocked.length > 0 && (
        <section className="warning" data-testid="eligibility-warning">
          <strong>已套用排除條件</strong>
          <p>所選排除條件與部分候選風格標籤衝突，因此這些候選不會作為正常推薦。</p>
          <p>觸發項目：{[...new Set(blocked.flatMap(({ reasons }) => reasons.map(({ exclusionOptionId }) => exclusionLabel(exclusionOptionId))))].join('、')}</p>
        </section>
      )}
      <section className="result-section">
        <div className="section-heading"><p className="eyebrow">PRIMARY</p><h2>主要推薦</h2></div>
        {presentation.primary.length ? (
          <div className="primary-grid">
            {presentation.primary.map((candidate, index) => (
              <CandidateCard candidate={candidate} label={`推薦 ${index + 1}`} key={candidate.styleId} />
            ))}
          </div>
        ) : (
          <div className="empty-result"><h3>沒有符合條件的主要推薦</h3><p>替代推薦如有可用，仍會在下方顯示；系統不會自行改選被阻擋的首選。</p></div>
        )}
      </section>
      <section className="result-section">
        <div className="section-heading"><p className="eyebrow">ALTERNATIVES</p><h2>也可以試試</h2></div>
        <div className="alternative-grid">
          {presentation.alternatives.map((candidate, index) => (
            <CandidateCard candidate={candidate} label={`替代 ${index + 1}`} key={candidate.styleId} />
          ))}
        </div>
      </section>
      {result.eligibility.blockedLead && (
        <section className="blocked-lead">
          <p className="eyebrow">BLOCKED LEAD</p>
          <h2>原本的高分候選已被排除</h2>
          <p>{adaptCandidateForPresentation(result.eligibility.blockedLead).availability === 'available'
            ? (adaptCandidateForPresentation(result.eligibility.blockedLead) as Extract<PresentationCandidate, { availability: 'available' }>).styleDisplayName
            : result.eligibility.blockedLead.styleId} 僅作為衝突提示，不列入正常推薦。</p>
        </section>
      )}
      <footer className="results-actions">
        {result.eligibility.selectedPrimary && <button className="button button--primary" onClick={onFinder}>以這個風格找拉麵</button>}
        <button className="button button--secondary" onClick={onRestart}>重新作答</button>
      </footer>
    </main>
  )
}

function FinderPage({ draft, onBack }: { draft: AnswerDraft; onBack(): void }) {
  const result = composeRuntimeResult(draft)
  if (!result.ok) return <ErrorPanel message={result.message} />
  const projection = deriveFinderProjection(result.eligibility.selectedPrimary)
  const candidate = result.eligibility.selectedPrimary
  const presentation = candidate ? adaptCandidateForPresentation(candidate) : null
  return (
    <main className="finder-shell">
      <Brand compact />
      <section className="finder-panel">
        <p className="eyebrow">FINDER PREVIEW</p>
        <h1>用這個風格繼續找</h1>
        {projection.availability === 'available' && presentation?.availability === 'available' ? (
          <>
            <div className="finder-token"><span>初始風格</span><strong>{presentation.styleDisplayName}</strong><code>{projection.initialFilterId}</code></div>
            <p>這個篩選身份已由可推薦的主要結果建立。地圖、定位與店舖搜尋將在下一階段接上。</p>
          </>
        ) : <p>目前沒有可用的主要推薦，因此不建立Finder篩選。</p>}
        <button className="button button--secondary" onClick={onBack}>回到結果</button>
      </section>
    </main>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return <main className="error-shell"><Brand compact /><section><h1>目前無法顯示</h1><p>{message}</p><a className="button button--primary" href="/">回到首頁</a></section></main>
}

export function App() {
  const restored = useMemo(() => restoreWebState(window.localStorage), [])
  const [draft, setDraft] = useState<AnswerDraft>(() => restored.ok ? restored.state.draft : {})
  const initialFlow = useMemo(() => evaluateFlow(questionModel, draft), [])
  const [flow, setFlow] = useState<FlowState>(initialFlow)
  const [currentQuestionId, setCurrentQuestionId] = useState<QuestionId | undefined>(() => (
    restored.ok ? restored.state.currentQuestionId : undefined
  ))
  const { page, navigate } = usePage()

  useEffect(() => {
    if (!restored.ok && restored.code === 'WEB_STATE_INVALID') clearWebState(window.localStorage)
  }, [])

  useEffect(() => {
    if (Object.keys(draft).length === 0) return
    saveWebState(window.localStorage, {
      draft,
      ...(currentQuestionId ? { currentQuestionId } : {}),
      completed: flow.status === 'complete',
    })
  }, [draft, flow.status, currentQuestionId])

  const begin = () => {
    clearWebState(window.localStorage)
    const nextFlow = evaluateFlow(questionModel, {})
    setDraft({})
    setFlow(nextFlow)
    setCurrentQuestionId(getFirstActionableQuestion(nextFlow))
    navigate('quiz')
  }
  const resume = () => {
    if (flow.status === 'complete') {
      navigate('results')
      return
    }
    const preferred = currentQuestionId && flow.interactiveQuestionIds.includes(currentQuestionId)
      ? currentQuestionId
      : getFirstActionableQuestion(flow)
    setCurrentQuestionId(preferred)
    navigate('quiz')
  }
  const submit = (questionId: QuestionId, optionIds: readonly OptionId[]) => {
    const result = applyAnswer(questionModel, draft, { questionId, optionIds })
    if (!result.accepted) return
    setDraft(result.draft)
    setFlow(result.state)
    if (result.state.status === 'complete') {
      setCurrentQuestionId(questionId)
      saveWebState(window.localStorage, {
        draft: result.draft,
        currentQuestionId: questionId,
        completed: true,
      })
      navigate('results')
      return
    }
    const next = getNextInteractiveQuestion(result.state, questionId)
      ?? getFirstActionableQuestion(result.state)
    setCurrentQuestionId(next)
  }
  const back = (questionId: QuestionId) => {
    const previous = getPreviousInteractiveQuestion(flow, questionId)
    if (previous) setCurrentQuestionId(previous)
    else navigate('home')
  }
  const reset = () => begin()

  const hasProgress = Object.keys(draft).length > 0
  if (page === 'home') return <HomePage hasProgress={hasProgress} completed={flow.status === 'complete'} onStart={begin} onContinue={resume} onReset={reset} />
  if (page === 'results') return <ResultsPage draft={draft} onRestart={reset} onFinder={() => navigate('finder')} />
  if (page === 'finder') return <FinderPage draft={draft} onBack={() => navigate('results')} />
  const questionId = currentQuestionId ?? getFirstActionableQuestion(flow)
  if (!questionId || flow.status !== 'incomplete') {
    return flow.status === 'complete'
      ? <ResultsPage draft={draft} onRestart={reset} onFinder={() => navigate('finder')} />
      : <ErrorPanel message="問卷狀態無法恢復，請回到首頁重新開始。" />
  }
  return <QuestionnairePage draft={draft} flow={flow} currentQuestionId={questionId} onSubmit={submit} onBack={back} />
}
