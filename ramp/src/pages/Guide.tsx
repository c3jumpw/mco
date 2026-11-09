import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMe } from '../lib/session';
import { useIsMobile, useTitle } from '../lib/hooks';
import GuideView, { type GuideViewMode } from '../guide/GuideView';
import type { GuideData } from '../guide/types';
import data from '../guide/guide.json';

export default function Guide() {
  useTitle('Guide');
  const { rank } = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mobile = useIsMobile();
  const view = params.get('view') as GuideViewMode | null;
  return (
    <GuideView data={data as GuideData} rank={rank} initialView={view || undefined}
      openRoute={(r) => navigate(r)} stickyTop={mobile ? 56 : 0} />
  );
}
