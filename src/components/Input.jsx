export default function Input({ label, error, className = '', ...props }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {props.type === 'textarea' ? <textarea {...props} /> : <input {...props} />}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}
