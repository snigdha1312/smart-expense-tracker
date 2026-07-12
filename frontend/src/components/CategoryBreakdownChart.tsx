import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BreakdownData {
  category_name: string;
  category_color: string;
  total: string;
  percentage: number;
}

interface CategoryBreakdownChartProps {
  data: BreakdownData[];
}

export default function CategoryBreakdownChart({ data }: CategoryBreakdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
        <span className="text-3xl mb-2">📊</span>
        <p className="text-xs">No expense data logged for this month</p>
      </div>
    );
  }

  // Formatting tooltip labels
  const renderTooltipContent = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const { name, value, payload: item } = payload[0];
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 shadow-xl text-xs">
          <p className="font-bold text-white mb-1">{name}</p>
          <p className="text-slate-350">
            Amount: <strong className="text-slate-100">${parseFloat(item.total).toFixed(2)}</strong>
          </p>
          <p className="text-slate-350">
            Share: <strong className="text-emerald-400">{value.toFixed(1)}%</strong>
          </p>
        </div>
      );
    }
    return null;
  };

  const chartData = data.map(item => ({
    name: item.category_name,
    value: item.percentage,
    color: item.category_color || '#6b7280',
    total: item.total
  }));

  return (
    <div className="h-[300px] w-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius={65}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={renderTooltipContent} />
          <Legend 
            verticalAlign="bottom" 
            height={40}
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-slate-400 hover:text-slate-200 font-semibold">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
