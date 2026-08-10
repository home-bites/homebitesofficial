/** Shared display helpers. */

export const inr = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

/** Firestore Timestamp | Date | ISO string | millis -> Date | null */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && value.seconds != null) {
    return new Date(value.seconds * 1000);
  }
  return null;
}

export function timeAgo(value) {
  const d = toDate(value);
  if (!d) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Order lifecycle in the order the customer experiences it. */
export const ORDER_STAGES = [
  { key: 'Pending', label: 'Order placed', hint: 'We have your order' },
  { key: 'Accepted', label: 'Confirmed', hint: 'The kitchen accepted it' },
  { key: 'Preparing', label: 'Preparing', hint: 'Being cooked fresh' },
  { key: 'Ready', label: 'Ready', hint: 'Packed and waiting for pickup' },
  { key: 'OutForDelivery', label: 'On the way', hint: 'Your rider is heading over' },
  { key: 'Delivered', label: 'Delivered', hint: 'Enjoy your meal' },
];

export const stageIndex = (status) => {
  const i = ORDER_STAGES.findIndex((s) => s.key === status);
  return i === -1 ? 0 : i;
};
