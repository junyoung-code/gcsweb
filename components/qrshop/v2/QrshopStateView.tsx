import Button from '@/components/ui/button/Button';

type QrshopStateViewProps = {
  icon?: 'cart' | 'warning';
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function QrshopStateView({ icon, title, description, actionLabel, onAction }: QrshopStateViewProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className={`flex w-full max-w-[343px] flex-col items-center text-center ${icon ? '-translate-y-7' : ''}`}>
        {icon ? (
          <span
            aria-hidden
            className="mb-4 h-10 w-10 bg-orange-5"
            style={{
              WebkitMask: `url('${icon === 'cart' ? '/assets/icons/filled/Filled/Cart.svg' : '/assets/icons/additional/icon-park-solid_caution.svg'}') center / contain no-repeat`,
              mask: `url('${icon === 'cart' ? '/assets/icons/filled/Filled/Cart.svg' : '/assets/icons/additional/icon-park-solid_caution.svg'}') center / contain no-repeat`,
            }}
          />
        ) : <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-orange-1 text-2xl text-orange-6">!</div>}
        <h1 className="typo-heading-small text-neutral-12">{title}</h1>
        {description ? <p className="typo-body-small mt-[3px] whitespace-pre-line text-neutral-9">{description}</p> : null}
        {actionLabel && onAction ? <Button className="mt-6" color="orange" onClick={onAction}>{actionLabel}</Button> : null}
      </div>
    </div>
  );
}
