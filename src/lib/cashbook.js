export const currencies = ['AFN', 'USD', 'PKR', 'IRR']
export function kabulToday() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year','month','day'].map(key => parts.find(p => p.type === key).value).join('-')
}
export const cents = value => Math.round(Number(value || 0) * 100)
export function simpleLedger(accounts,entries,scope,currency) {
  const selected=accounts.filter(a=>a.currency===currency&&(scope==='all'||(scope==='admin'?a.branch_id===null:a.branch_id===scope)))
  const map=new Map(selected.map(a=>[a.id,a]))
  const rows=entries.filter(e=>map.has(e.account_id)).map(e=>({...e,branch_id:map.get(e.account_id).branch_id}))
  for(const a of selected)if(cents(a.opening_balance)!==0)rows.push({id:`opening-${a.id}`,branch_id:a.branch_id,entry_date:a.opening_date,direction:'in',amount:a.opening_balance,opening:true})
  rows.sort((a,b)=>b.entry_date.localeCompare(a.entry_date)||a.id.localeCompare(b.id))
  const incoming=rows.filter(e=>e.direction==='in').reduce((sum,e)=>sum+cents(e.amount),0)
  const outgoing=rows.filter(e=>e.direction==='out').reduce((sum,e)=>sum+cents(e.amount),0)
  return {rows,incoming,outgoing,balance:incoming-outgoing}
}
export async function allRows(client, table, select = '*') {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(table).select(select).order('id').range(offset,offset+499)
    if (error) throw error
    rows.push(...data)
    if (data.length < 500) return rows
  }
}
