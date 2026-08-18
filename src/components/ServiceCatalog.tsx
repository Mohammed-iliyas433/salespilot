import React, { useState } from "react";
import { motion } from "motion/react";
import toolsDb from "../lib/tools-db.json";

export default function ServiceCatalog() {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <span className="eyebrow-label block mb-1">Portfolio</span>
          <h2 className="font-serif text-2xl text-[#0E0D0C] font-normal">Authorized Enterprise Catalog</h2>
        </div>
        <div className="text-xs text-[#6B6862]">
          {toolsDb.length} Verified Solutions
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {toolsDb.map((tool: any) => (
          <div 
            key={tool.name} 
            className={`luxury-card p-6 transition-all cursor-pointer group ${
              selectedTool === tool.name 
                ? 'border-[#C9B183] bg-[#FFFFFF]' 
                : 'hover:border-[#0E0D0C]/30 bg-[#F5F4F2]'
            }`}
            onClick={() => setSelectedTool(selectedTool === tool.name ? null : tool.name)}
          >
            <div className="flex items-start justify-between mb-3 gap-2">
              <h3 className="font-serif text-base text-[#0E0D0C] font-normal group-hover:text-[#C9B183] transition-colors">{tool.name}</h3>
              <span className="font-serif text-sm text-[#C9B183] shrink-0 font-normal">${tool.price}<span className="text-[11px] font-sans text-[#6B6862]">/mo</span></span>
            </div>
            
            <p className="text-xs text-[#6B6862] leading-relaxed mb-3">{tool.usage}</p>
            
            {selectedTool === tool.name && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-4 pt-4 border-t border-[#E5E4E1] space-y-2 text-xs"
              >
                <div>
                  <span className="eyebrow-label block mb-1">Overview</span>
                  <p className="text-[#6B6862] leading-relaxed">{tool.description}</p>
                </div>
                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-[#6B6862]">Authorized Discount:</span>
                  <span className="font-medium text-[#C9B183]">{tool.minDiscount}% – {tool.maxDiscount}%</span>
                </div>
              </motion.div>
            )}
          </div>
        ))}
      </div>

      <div className="text-center pt-4">
        <p className="text-xs text-[#6B6862]">Official catalog rates • Real-time license availability</p>
      </div>
    </div>
  );
}
