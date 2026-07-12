import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TrendItem {
  month: string;
  income: number;
  expense: number;
}

interface TrendChartProps {
  data: TrendItem[];
}

export default function TrendChart({ data }: TrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
        <span className="text-3xl mb-2">📈</span>
        <p className="text-xs">No transaction trend data found</p>
      </div>
    );
  }

  // Format month label from "YYYY-MM" to readable "MMM YYYY"
  const formatMonth = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('default', { month: 'short', year: 'numeric' });
    } catch {
      return monthStr;
    }
  };

  const renderTooltipContent = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 shadow-xl text-xs space-y-1">
          <p className="font-bold text-white mb-1">{formatMonth(label)}</p>
          {payload.map((pld: any) => (
            <p key={pld.name} className="flex justify-between gap-4">
              <span style={{ color: pld.color }}>{pld.name}:</span>
              <strong className="text-slate-100">${pld.value.toFixed(2)}</strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 15, right: 10, left: -15, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} />
          <XAxis 
            dataKey="month" 
            tickFormatter={formatMonth}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            stroke="#334155"
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            stroke="#334155"
          />
          <Tooltip content={renderTooltipContent} />
          <Legend 
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-slate-400 font-semibold">{value}</span>}
          />
          <Line 
            type="monotone" 
            dataKey="income" 
            name="Income" 
            stroke="#10b981" 
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 1 }}
            activeDot={{ r: 6 }}
          />
          <Line 
            type="monotone" 
            dataKey="expense" 
            name="Expense" 
            stroke="#f43f5e" 
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 1 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
