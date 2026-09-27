export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' },
  { code: 'SN', name: 'Sénégal', flag: '🇸🇳' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'BJ', name: 'Bénin', flag: '🇧🇯' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬' },
  { code: 'CM', name: 'Cameroun', flag: '🇨🇲' },
  { code: 'GN', name: 'Guinée', flag: '🇬🇳' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦' },
  { code: 'CD', name: 'RD Congo', flag: '🇨🇩' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'OTHER', name: 'Autre pays', flag: '🌍' },
];
