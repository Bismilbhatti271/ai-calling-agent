interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function Card({ children, className = '', glass = true, onClick }: CardProps) {
  return (
    <div
      className={`${
        glass
          ? 'glass'
          : 'bg-card border border-white/10'
      } rounded-lg p-6 transition-all-smooth ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface KPICardProps {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down';
  };
  className?: string;
}

export function KPICard({
  icon,
  label,
  value,
  subtext,
  trend,
  className = '',
}: KPICardProps) {
  return (
    <Card className={`hover:bg-white/5 cursor-pointer ${className}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-gray-400 text-sm font-medium">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
          {subtext && <p className="text-gray-500 text-xs mt-2">{subtext}</p>}
        </div>
        {icon && <div className="text-gray-500">{icon}</div>}
      </div>
      {trend && (
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              trend.direction === 'up' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {trend.direction === 'up' ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-gray-500 text-xs">vs yesterday</span>
        </div>
      )}
    </Card>
  );
}
