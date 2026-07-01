export function truncateAddress(address: string, prefix = 10, suffix = 8): string {
  if (address.length <= prefix + suffix + 3) return address;
  return `${address.slice(0, prefix)}…${address.slice(-suffix)}`;
}
