import { Component, type ErrorInfo, type ReactNode } from 'react'

type State = {
  error: Error | null
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('app-render-error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main dir="rtl" className="min-h-screen bg-void p-6 text-text">
        <div className="mx-auto max-w-2xl rounded-2xl border border-error/60 bg-panel p-6 shadow-xl">
          <h1 className="text-xl font-extrabold text-error">تعذر تحميل واجهة المنصة</h1>
          <p className="mt-3 leading-7 text-mute">
            حدث خطأ أثناء تشغيل الواجهة. حدّث الصفحة، وإذا استمر الخطأ أرسل هذه الرسالة للمطور.
          </p>
          <pre className="mt-4 overflow-auto rounded-xl bg-ink p-4 text-left text-xs text-light-gold" dir="ltr">
            {this.state.error.message}
          </pre>
        </div>
      </main>
    )
  }
}
