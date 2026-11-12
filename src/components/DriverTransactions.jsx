import PersonTransactions from './PersonTransactions'

export default function DriverTransactions({ driver, language, onClose }) {
  return <PersonTransactions key={driver.id} person={driver} kind="driver" language={language} onClose={onClose} />
}
