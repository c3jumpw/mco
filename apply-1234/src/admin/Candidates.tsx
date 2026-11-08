import { useEffect, useState } from 'react';
import type { Job } from '../lib/types';
import { listJobs } from './data';
import Pipeline from './Pipeline';
import { Loading, Select } from '../ui';

export default function Candidates() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobId, setJobId] = useState('');
  useEffect(() => { listJobs().then(setJobs); }, []);
  if (!jobs) return <Loading />;
  return (
    <div className="rise">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <h1 className="font-display text-4xl sm:text-5xl leading-none">Candidates</h1>
        <Select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-auto min-w-48">
          <option value="">All jobs</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </Select>
      </div>
      <Pipeline key={jobId || 'all'} jobId={jobId || undefined} jobs={jobs} />
    </div>
  );
}
