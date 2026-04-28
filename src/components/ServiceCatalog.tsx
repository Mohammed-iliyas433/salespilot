import React, { useState } from "react";
import { motion } from "motion/react";
import toolsDb from "../lib/tools-db.json";

export default function ServiceCatalog() {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-bold mb-4 uppercase tracking-tighter">Service_Catalog</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {toolsDb.map((tool: any) => (
          <div 
            key={tool.name} 
            className={`p-4 rounded border transition-all cursor-pointer group ${
              selectedTool === tool.name 
                ? 'bg-brand-primary/10 border-brand-primary shadow-[0_0_15px_rgba(79,70,229,0.1)]' 
                : 'bg-brand-sidebar/30 border-brand-border hover:border-brand-zinc-700'
            }`}
            onClick={() => setSelectedTool(selectedTool === tool.name ? null : tool.name)}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-brand-zinc-100 group-hover:text-brand-primary transition-colors">{tool.name}</p>
              <p className="text-xs font-mono text-brand-primary font-bold">${tool.price}/mo</p>
            </div>
            <p className="text-[10px] text-brand-zinc-500 font-mono italic mb-2">// {tool.usage}</p>
            
            {selectedTool === tool.name && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-3 pt-3 border-t border-brand-primary/20"
              >
                <p className="text-[10px] text-brand-zinc-400 leading-relaxed font-mono">
                  <span className="text-brand-primary font-bold">INFO:</span> {tool.description}
                  <br/><br/>
                  <span className="text-brand-primary font-bold">DISCOUNT_RANGE:</span> {tool.minDiscount}% - {tool.maxDiscount}%
                </p>
              </motion.div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-[10px] font-mono text-brand-zinc-500 uppercase text-center tracking-widest">// REPOSITORY_V2.0 // DEPLOYED_OFFLINE_CACHE</p>
    </div>
  );
}
