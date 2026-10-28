export default function Brand({ text }) {
  return <div className="brand"><img className="brand-logo" src="/pedram-logo.jpeg" alt="" /><div><strong>{text?.pedram || 'PEDRAM'}</strong><span>{text?.companyName || 'Pedram International Transport'}</span></div></div>
}
