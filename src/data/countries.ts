export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  example: string;
  currency: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮', dialCode: '+225', example: '07 48 92 10 33', currency: 'XOF' },
  { code: 'SN', name: 'Sénégal', flag: '🇸🇳', dialCode: '+221', example: '77 123 45 67', currency: 'XOF' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬', dialCode: '+228', example: '90 12 34 56', currency: 'XOF' },
  { code: 'BJ', name: 'Bénin', flag: '🇧🇯', dialCode: '+229', example: '97 12 34 56', currency: 'XOF' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', dialCode: '+226', example: '70 12 34 56', currency: 'XOF' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱', dialCode: '+223', example: '70 12 34 56', currency: 'XOF' },
  { code: 'CM', name: 'Cameroun', flag: '🇨🇲', dialCode: '+237', example: '6 90 12 34 56', currency: 'XAF' },
  { code: 'CD', name: 'RD Congo', flag: '🇨🇩', dialCode: '+243', example: '81 234 56 78', currency: 'CDF' },
  { code: 'GN', name: 'Guinée', flag: '🇬🇳', dialCode: '+224', example: '620 12 34 56', currency: 'GNF' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬', dialCode: '+242', example: '06 123 45 67', currency: 'XAF' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦', dialCode: '+241', example: '07 12 34 56', currency: 'XAF' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪', dialCode: '+227', example: '90 12 34 56', currency: 'XOF' },
  { code: 'FR', name: 'France', flag: '🇫🇷', dialCode: '+33', example: '06 12 34 56 78', currency: 'EUR' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪', dialCode: '+32', example: '0470 12 34 56', currency: 'EUR' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', dialCode: '+1', example: '514 123 4567', currency: 'CAD' },
  { code: 'OTHER', name: 'Autre pays', flag: '🌍', dialCode: '+', example: '123456789', currency: 'USD' },
];

export function getCountryByCode(code?: string): CountryOption {
  if (!code) return COUNTRIES[0];
  const found = COUNTRIES.find((c) => c.code.toUpperCase() === code.toUpperCase().trim());
  return found || COUNTRIES[0];
}

export function getCountryByName(name?: string): CountryOption {
  if (!name) return COUNTRIES[0];
  const found = COUNTRIES.find((c) => c.name.toLowerCase() === name.toLowerCase().trim());
  return found || COUNTRIES[0];
}
