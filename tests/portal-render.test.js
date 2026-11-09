import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('branch navigation and direct Branches URL never render branch management controls', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const previousWindow = globalThis.window
  try {
    globalThis.window = { location: { hash: '#/branches', pathname: '/', search: '' } }
    const { default: Dashboard } = await server.ssrLoadModule('/src/pages/DashboardPage.jsx')
    const { default: Branches } = await server.ssrLoadModule('/src/pages/BranchesPage.jsx')
    const profile = { id: 'test-user', role: 'branch_manager', branch_id: 'test-branch', account_enabled: true, full_name: 'Branch user' }
    const html = renderToStaticMarkup(React.createElement(Dashboard, { language: 'en', profile, session: { user: {} }, onLanguageChange() {}, onSignOut() {} }))
    assert.equal((html.match(/class="module-card"/g) || []).length, 4)
    assert.doesNotMatch(html, />Branches<|Add Branch|Create branch and account/)
    assert.match(html, /Fleet availability|Operations overview/)
    assert.doesNotMatch(html, />Traders<|Traders with overdue balances/)
    globalThis.window.location.hash = '#/trader-accounts'
    const traderUrl = renderToStaticMarkup(React.createElement(Dashboard, { language: 'en', profile }))
    assert.doesNotMatch(traderUrl, /Search traders|Register trader|>Traders</)
    assert.equal(renderToStaticMarkup(React.createElement(Branches, { language: 'en', profile })), '')
    const presidentHtml = renderToStaticMarkup(React.createElement(Branches, { language: 'en', profile: { ...profile, role: 'president' } }))
    assert.match(presidentHtml, /Add Branch/)
    assert.equal(renderToStaticMarkup(React.createElement(Branches, { language: 'en', profile: { ...profile, role: 'president', account_enabled: false } })), '')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    await server.close()
  }
})
