import React from 'react';
import { useTranslation } from '../hooks/useTranslation';

const DataScientistGuide: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto mt-16 p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] text-left">
      <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
        <span className="p-2 bg-gradient-to-br from-[#3b82f6] to-[#06d6a0] rounded-lg">🧪</span>
        {t('guide.scientist.title')}
      </h2>
      
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#3b82f6]/30 transition-colors">
          <div className="text-2xl mb-3">🛡️</div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('guide.scientist.sandbox')}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            {t('guide.scientist.sandboxDesc')}
          </p>
        </div>
        
        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#06d6a0]/30 transition-colors">
          <div className="text-2xl mb-3">📊</div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('guide.scientist.charts')}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            {t('guide.scientist.chartsDesc')}
          </p>
        </div>
        
        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#3b82f6]/30 transition-colors">
          <div className="text-2xl mb-3">📑</div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('guide.scientist.reports')}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            {t('guide.scientist.reportsDesc')}
          </p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-[#3b82f6]/10 to-[#06d6a0]/10 p-6 rounded-2xl border border-white/5">
        <h3 className="text-lg font-semibold text-white mb-4">{t('guide.scientist.quickStart')}</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3 text-gray-300">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-xs text-[#3b82f6] font-bold">1</span>
            <span>{t('guide.scientist.step1')}</span>
          </li>
          <li className="flex items-start gap-3 text-gray-300">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-xs text-[#3b82f6] font-bold">2</span>
            <span>{t('guide.scientist.step2')}</span>
          </li>
          <li className="flex items-start gap-3 text-gray-300">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-xs text-[#3b82f6] font-bold">3</span>
            <span>{t('guide.scientist.step3')}</span>
          </li>
        </ul>
      </div>
      
      <div className="mt-8 text-center text-xs text-gray-500 uppercase tracking-widest">
        Powered by DataPulse AI Engine v4.0
      </div>
    </div>
  );
};

export default DataScientistGuide;
