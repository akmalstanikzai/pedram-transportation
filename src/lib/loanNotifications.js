export function dueLoanAlerts(loans, today) {
  return (loans || [])
    .filter(loan => Number(loan.remaining) > 0 && loan.due_date && loan.due_date <= today)
    .map(loan => ({ ...loan, timing: loan.due_date === today ? 'today' : 'overdue' }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || String(a.receipt_number).localeCompare(String(b.receipt_number)))
}
