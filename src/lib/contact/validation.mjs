export const messages = {
  en: {
    required: 'This field is required.', email: 'Please enter a valid email address.', invalid: 'Please enter a valid value.', long: 'This value is too long.',
    loading: 'Preparing contact form…', sending: 'Sending…', review: 'Please review the highlighted fields.', retry: 'Retry',
    unavailable: 'The contact form is temporarily unavailable. Please use the email addresses on this page.',
    expired: 'Your form session expired. Reload the page and try again.', limited: 'Too many requests. Please wait and try again later.',
    uncertain: 'We could not confirm whether your message was sent. Please wait before trying again, or contact us using the email addresses on this page.',
    success: 'Thank you. Your message has been sent.',
  },
  ar: {
    required: 'هذا الحقل مطلوب.', email: 'يرجى إدخال عنوان بريد إلكتروني صحيح.', invalid: 'يرجى إدخال قيمة صحيحة.', long: 'القيمة المدخلة طويلة جداً.',
    loading: 'جارٍ تجهيز نموذج التواصل…', sending: 'جارٍ الإرسال…', review: 'يرجى مراجعة الحقول المحددة.', retry: 'إعادة المحاولة',
    unavailable: 'نموذج التواصل غير متاح مؤقتاً. يرجى استخدام عناوين البريد الإلكتروني في هذه الصفحة.',
    expired: 'انتهت صلاحية جلسة النموذج. يرجى إعادة تحميل الصفحة والمحاولة مجدداً.', limited: 'طلبات كثيرة جداً. يرجى الانتظار والمحاولة لاحقاً.',
    uncertain: 'تعذر التأكد من إرسال رسالتك. يرجى الانتظار قبل المحاولة مجدداً، أو التواصل عبر عناوين البريد الإلكتروني في هذه الصفحة.',
    success: 'شكراً لك. تم إرسال رسالتك.',
  },
};
export const limits = { name: 100, email: 254, subject: 200, message: 5000 };
export const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[\r\n]/.test(value);
export function validateContact(fields, language = 'en') {
  const t = messages[language] || messages.en, errors = {};
  for (const [key, max] of Object.entries(limits)) {
    const raw = fields[key];
    if (raw !== undefined && typeof raw !== 'string') { errors[key] = t.invalid; continue; }
    const value = (raw || '').trim();
    if (['name', 'email'].includes(key) && !value) { errors[key] = t.required; continue; }
    if (value.length > max) { errors[key] = t.long; continue; }
    if (key !== 'message' && /[\x00-\x1f\x7f]/.test(value)) errors[key] = t.invalid;
    if (key === 'email' && value && !validEmail(value)) errors[key] = t.email;
    if (key === 'message' && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) errors[key] = t.invalid;
  }
  return errors;
}
