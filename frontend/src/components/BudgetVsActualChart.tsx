import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BudgetVsActualItem {
  category_name: string;
  category_color: string;
  limit_amount: number;
  spent_amount: number;
  percentage_used: number;
  is_over_budget: boolean;
}

interface BudgetVsActualChartProps {
  data: BudgetVsActualItem[];
}

export default function BudgetVsActualChart({ data }: BudgetVsActualChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
        <span className="text-3xl mb-2">📊</span>
        <p className="text-xs">No budgets set for this month</p>
      </div>
    );
  }

  const renderTooltipContent = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const budgetVal = payload[0].value;
      const spentVal = payload[1].value;
      const overBudget = spentVal > budgetVal;
      
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 shadow-xl text-xs space-y-1">
          <p className="font-bold text-white mb-1">{label}</p>
          <p className="flex justify-between gap-4 text-cyan-400">
            <span>Budget Limit:</span>
            <strong>${budgetVal.toFixed(2)}</strong>
          </p>
          <p className={`flex justify-between gap-4 ${overBudget ? 'text-rose-400' : 'text-emerald-450'}`}>
            <span>Actual Spent:</span>
            <strong>${spentVal.toFixed(2)}</strong>
          </p>
          {overBudget && (
            <p className="text-rose-400 font-bold mt-1 text-[10px] uppercase tracking-wider">
              Over Budget by ${(spentVal - budgetVal).toFixed(2)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 15, right: 10, left: -15, bottom: 5 }}
          barSize={20}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} />
          <XAxis 
            dataKey="category_name" 
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
          
          {/* Limit Bar */}
          <Bar 
            dataKey="limit_amount" 
            name="Budget Limit" 
            fill="#0891b2" 
            radius={[4, 4, 0, 0]}
          />
          
          {/* Spent Bar with cell coloring */}
          <Bar 
            dataKey="spent_amount" 
            name="Actual Spent" 
            radius={[4, 4, 0, 0]}
          >
            {data.map((entry, index) => {
              const isOver = entry.spent_amount > entry.limit_amount;
              return (
                <Cell 
                  key={`cell-${index}`} 
                  fill={isOver ? '#f43f5e' : '#10b981'} 
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
