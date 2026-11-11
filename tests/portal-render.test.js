import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { initialBranchForm } from '../src/lib/branchForm.js'
import { capacityEntry } from '../src/lib/capacity.js'

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
    const { BranchDetailsFields } = await server.ssrLoadModule('/src/pages/BranchesPage.jsx')
    const branchFields = renderToStaticMarkup(React.createElement(BranchDetailsFields, { language: 'fa', form: initialBranchForm, update() {}, setSelectedFiles() {} }))
    for (const label of ['نام شعبه','کد شعبه','ولایت','ولسوالی','موقعیت','نام','تخلص','نام پدر','موبایل','قریه','عکس مدیر','تذکره','سی وی','سند تحصیلی','قرارداد','اسناد دیگر']) assert.ok(branchFields.includes(label), label)
    assert.doesNotMatch(branchFields, /شهر یا ولسوالی|آدرس کامل|شماره شعبه|شماره تماس مدیر|نمبر تذکره|سند ۱|سند ۲/)
    assert.equal((branchFields.match(/type="file"/g) || []).length, 6)
    const legacyFields = renderToStaticMarkup(React.createElement(BranchDetailsFields, { language: 'en', form: initialBranchForm, update() {}, setSelectedFiles() {}, editing: { id: 'old' }, files: { 'old:doc1': { file_name: 'existing.pdf', url: 'https://example.test/file' } } }))
    assert.match(legacyFields, /existing.pdf/)
    const { VehicleRegistrationFields, CapacityField } = await server.ssrLoadModule('/src/pages/VehiclesPage.jsx')
    for (const language of ['en','fa']) {
      const vehicleFields = renderToStaticMarkup(React.createElement(VehicleRegistrationFields, { language, form: {}, capacity: capacityEntry(null), onChange() {}, onCapacityChange() {} }))
      assert.match(vehicleFields, /Owner \(optional\)|مالک \(اختیاری\)/)
      assert.match(vehicleFields, /<option value=""[^>]*>(Optional|اختیاری)</)
      assert.doesNotMatch(vehicleFields.split('</select>')[0], /required/)
      assert.doesNotMatch(vehicleFields, /VIN|نمبر شاسی|Model year|سال ساخت|Permit number|نمبر جواز/)
      const fieldLabels = language === 'en' ? ['Plate number','Province','Foreign plate','Vehicle type','Body style','Model','Color','Weight capacity'] : ['نمبر پلیت','ولایت','پلیت خارجی','نوعیت','حالت','ماډل','رنگ','ظرفیت']
      for (let i=1;i<fieldLabels.length;i++) assert.ok(vehicleFields.indexOf(fieldLabels[i-1]) < vehicleFields.indexOf(fieldLabels[i]), `${fieldLabels[i-1]} before ${fieldLabels[i]}`)
      const capacityFields = renderToStaticMarkup(React.createElement(CapacityField, { language, value: capacityEntry('12.5'), onChange() {} }))
      assert.doesNotMatch(capacityFields, /<button|>Number<|>Fraction<|>عدد<|>کسر</)
      assert.equal((capacityFields.match(/type="number"/g)||[]).length, 2)
      assert.match(capacityFields, /value="25"/)
      assert.match(capacityFields, /value="2"/)
    }
    const { default: Cashbook } = await server.ssrLoadModule('/src/pages/CashbookPage.jsx')
    for (const language of ['en','fa']) {
      const branchCashbook = renderToStaticMarkup(React.createElement(Cashbook, { language, profile }))
      const toolbar = branchCashbook.split('simple-cashbook-toolbar')[1].split('<form')[0]
      assert.ok(toolbar.indexOf('cashbook-account-display') < toolbar.indexOf('solar-date-picker'))
      assert.doesNotMatch(branchCashbook, /value="admin"|Admin account|حساب مرکزی|Edit amount|Reverse receipt|Link to a trader/)
      assert.match(branchCashbook, /value="in"/)
      assert.match(branchCashbook, /value="out"/)
      assert.match(toolbar, /value="custom"/)
      assert.match(toolbar, /Print \/ Save PDF|چاپ \/ ذخیره PDF/)
      const presidentCashbook = renderToStaticMarkup(React.createElement(Cashbook, { language, profile: { ...profile, role: 'president' } }))
      const presidentToolbar = presidentCashbook.split('simple-cashbook-toolbar')[1].split('<form')[0]
      assert.ok(presidentToolbar.indexOf('value="admin"') < presidentToolbar.indexOf('solar-date-picker'))
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    await server.close()
  }
})
