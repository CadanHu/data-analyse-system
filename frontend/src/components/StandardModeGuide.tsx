import React from 'react';
import { useTranslation } from '../hooks/useTranslation';

const StandardModeGuide: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto mt-16 p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] text-left">
      <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
        <span className="p-2 bg-gradient-to-br from-[#3b82f6] to-[#06d6a0] rounded-lg">📊</span>
        {t('guide.standard.title')}
      </h2>
      
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#3b82f6]/30 transition-colors">
          <div className="text-2xl mb-3">🤖</div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('guide.standard.sql')}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            {t('guide.standard.sqlDesc')}
          </p>
        </div>
        
        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#06d6a0]/30 transition-colors">
          <div className="text-2xl mb-3">📈</div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('guide.standard.viz')}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            {t('guide.standard.vizDesc')}
          </p>
        </div>
        
        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#3b82f6]/30 transition-colors">
          <div className="text-2xl mb-3">🗄️</div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('guide.standard.multiDb')}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            {t('guide.standard.multiDbDesc')}
          </p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-[#3b82f6]/10 to-[#06d6a0]/10 p-6 rounded-2xl border border-white/5">
        <h3 className="text-lg font-semibold text-white mb-4">{t('guide.standard.quickStart')}</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3 text-gray-300">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-xs text-[#3b82f6] font-bold">1</span>
            <span>{t('guide.standard.step1')}</span>
          </li>
          <li className="flex items-start gap-3 text-gray-300">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-xs text-[#3b82f6] font-bold">2</span>
            <span>{t('guide.standard.step2')}</span>
          </li>
          <li className="flex items-start gap-3 text-gray-300">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#3b82f6]/20 flex items-center justify-center text-xs text-[#3b82f6] font-bold">3</span>
            <span>{t('guide.standard.step3')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default StandardModeGuide;
