import React from 'react';
import { AdminLayout } from './AdminLayout';

export const SettingsPage: React.FC = () => (
  <AdminLayout>
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Settings</h1>
      <p className="text-slate-400 text-sm mb-6">Proctoring configuration is managed per-examination. Edit an exam to adjust thresholds.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { title: 'Face Absent Threshold', value: '3 consecutive frames', desc: 'Number of frames without a face before triggering a violation' },
          { title: 'Head Pose Threshold', value: 'Yaw >30°, Pitch >20°', desc: 'Angle beyond which head movement is flagged' },
          { title: 'Gaze Away Threshold', value: '4 consecutive frames', desc: 'Frames looking away from screen before violation' },
          { title: 'Warnings Before Disqualification', value: '3 warnings', desc: 'Accumulated warning count triggering automatic disqualification' },
          { title: 'Object Detection Confidence', value: '0.6 (60%)', desc: 'Minimum confidence for prohibited object detection' },
          { title: 'Identity Mismatch Threshold', value: '0.7 (70%)', desc: 'Confidence above which identity mismatch triggers immediate disqualification' },
        ].map(item => (
          <div key={item.title} className="bg-dark-card border border-dark-border rounded-xl p-4">
            <h3 className="text-slate-100 font-medium text-sm">{item.title}</h3>
            <p className="text-primary-400 font-semibold text-lg mt-1">{item.value}</p>
            <p className="text-slate-500 text-xs mt-1">{item.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 p-4 bg-amber-900/20 border border-amber-700/40 rounded-xl">
        <p className="text-amber-400 text-sm font-medium">Demo Mode Active</p>
        <p className="text-slate-400 text-xs mt-1">The system is running with simulated AI providers. Set DEMO_MODE=false in .env and restart to enable real AI processing.</p>
      </div>
    </div>
  </AdminLayout>
);
