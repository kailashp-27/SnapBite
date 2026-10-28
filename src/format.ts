export const number = (value: number) => Math.round(value).toLocaleString();
export const decimal = (value: number) => value.toLocaleString(undefined, {maximumFractionDigits: 1});
export const formatDate = (value: string, options: Intl.DateTimeFormatOptions) => new Date(value + 'T12:00:00').toLocaleDateString('en', options);
