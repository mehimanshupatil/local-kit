import type { IconType } from 'react-icons';

interface Props {
  icon: IconType;
  size?: number;
  className?: string;
}

export default function Icon({ icon: IconComp, size = 24, className }: Props) {
  return <IconComp size={size} className={className} />;
}
