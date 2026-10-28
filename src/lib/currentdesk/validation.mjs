export const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=(?:.*\d|.*[!@#$%^&*?_~\-£().,]))[\p{L}\p{Nd}a-zA-Z0-9!@#$%^&*?_~\-£()., ]{8,256}$/u;
export const checked = value => ['on', 'true', true, '1', 1].includes(value);
export function validateFields(fields, values, now = new Date()) {
  const errors = {};
  for (const field of fields) {
    const raw = values[field.name];
    const value = typeof raw === 'string' ? (field.type === 'password' ? raw : raw.trim()) : '';
    if (raw !== undefined && typeof raw !== 'string') { errors[field.name] = 'Please enter a valid value.'; continue; }
    if (field.required && (field.type === 'checkbox' ? !checked(raw) : !value)) { errors[field.name] = 'This field is required.'; continue; }
    if (!value) continue;
    if (value.length > (field.type === 'password' ? 256 : field.type === 'email' ? 254 : 512)) { errors[field.name] = 'This value is too long.'; continue; }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field.name] = 'Please enter a valid email address.';
    if (field.type === 'tel' && (!/^[+()\d .-]{6,32}$/.test(value) || value.replace(/\D/g, '').length < 6)) errors[field.name] = 'Please enter a valid telephone number.';
    if (field.name === 'account-password' && !passwordPattern.test(value)) errors[field.name] = 'Password must be 8–256 characters, with an uppercase letter, a lowercase letter, and a number or special character.';
    if (field.name === 'account-password-confirm' && value !== values['account-password']) errors[field.name] = 'Passwords do not match.';
    if (field.type === 'date') {
      const date = new Date(`${value}T12:00:00Z`);
      let age = now.getUTCFullYear() - date.getUTCFullYear();
      if (now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) age--;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || age < 18 || age > 100) errors[field.name] = 'Please enter a valid birth date. You must be between 18 and 100 years old.';
    }
    if (field.type === 'radio' && field.options.length && !field.options.includes(value)) errors[field.name] = 'Please select a valid option.';
    if (/^trading-.*-(trades-per-month|average-deal-size)$/.test(field.name) && (!/^\d+(\.\d+)?$/.test(value) || Number(value) > 1e12)) errors[field.name] = 'Please enter a valid non-negative number.';
  }
  return errors;
}
