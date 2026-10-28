export const dictionaryById = {
  preferences: 'preferences', 'account-code': 'account-codes', titles: 'titles',
  countries: 'countries', 'residence-country': 'countries', 'address-country': 'countries',
  citizenship: 'nationalities', languages: 'languages', 'employment-statuses': 'employment-statuses',
  'annual-incomes': 'annual-incomes', 'liquid-assets': 'liquid-assets',
  experiences: 'experiences', 'average-deal-sizes': 'average-deal-sizes', 'initial-deposits': 'initial-deposits',
};
for (const category of ['spot', 'shares', 'futures', 'options']) {
  dictionaryById[`${category}-experience`] = 'experiences';
  dictionaryById[`${category}-experience-source`] = 'experience-sources';
}
dictionaryById['identification-types'] = 'identification-types';
export const marketingNames = {
  link_id: 'marketing-link-id', referral_id: 'marketing-referral-id',
  utm_campaign: 'marketing-utm-campaign', utm_medium: 'marketing-web-medium',
  utm_source: 'marketing-web-source', utm_term: 'marketing-web-term',
};
