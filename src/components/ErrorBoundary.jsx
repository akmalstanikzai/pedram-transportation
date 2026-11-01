import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    const fa = this.props.language === 'fa'
    return (
      <div className="loading-screen">
        <h1>{fa ? 'صفحه بارگیری نشد' : 'This view could not be loaded'}</h1>
        <p role="alert">
          {fa
            ? 'صفحه را تازه‌سازی کنید. اگر مشکل ادامه داشت با مسئول سیستم تماس بگیرید.'
            : 'Reload the page. If the problem continues, contact your administrator.'}
        </p>
        <button className="registry-primary" onClick={() => window.location.reload()}>
          {fa ? 'تازه‌سازی صفحه' : 'Reload page'}
        </button>
      </div>
    )
  }
}
