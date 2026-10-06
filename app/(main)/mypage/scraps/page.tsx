'use client';

import { NavBar } from '@/components/layout';
import TabBar from '@/components/ui/button/TabBar';
import EmptyviewText from '@/components/ui/common/EmptyviewText';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type ScrapTab = 'Project';

interface ScrapProject {
  id: string;
  teamName: string | null;
  title: string;
  thumbnailUrl: string | null;
  keywords: string[];
  url?: string;
}

const TAB_ITEMS: Array<{ key: ScrapTab; title: string }> = [{ key: 'Project', title: 'PROJECT' }];

const SCRAP_ENDPOINT = '/api/v1/mypage/scraps/project?page=1&size=50';

const EMPTY_CTA = { label: 'PROJECT 보러가기', href: '/archive' };

function ProjectCard({ item }: { item: ScrapProject }) {
  const linkUrl = item.url ?? `/projects/${item.id}`;

  return (
    <Link href={linkUrl} className="flex w-[343px] self-center gap-[15px] px-0 py-0">
      <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-[5.333px] bg-[#dddcdb]">
        {item.thumbnailUrl ? (
          <Image src={item.thumbnailUrl} alt={item.title} fill className="object-cover" sizes="64px" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="#999694" strokeWidth="1.2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="#999694" />
              <path d="M3 15L8 10L12 14L15 11L21 17" stroke="#999694" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex min-h-[80px] min-w-0 flex-1 items-center py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="truncate text-[13px] font-semibold leading-[1.5] tracking-[-0.26px] text-[#1a1918]">{item.teamName ?? 'GCS'}</p>
            <p className="line-clamp-2 whitespace-normal break-words text-[15px] leading-[1.5] text-[#1a1918]">{item.title}</p>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            {item.keywords?.length ? (
              item.keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center justify-center rounded-[8px] bg-[#fac0a1] px-[8px] py-[2px] text-[13px] leading-[1.5] tracking-[-0.26px] text-[#cf5d1f]"
                >
                  {kw}
                </span>
              ))
            ) : (
              <>
                <span className="inline-flex items-center justify-center rounded-[8px] bg-[#fac0a1] px-[8px] py-[2px] text-[13px] leading-[1.5] tracking-[-0.26px] text-[#cf5d1f]">2025</span>
                <span className="inline-flex items-center justify-center rounded-[8px] bg-[#fac0a1] px-[8px] py-[2px] text-[13px] leading-[1.5] tracking-[-0.26px] text-[#cf5d1f]">공모전</span>
              </>
            )}
          </div>
        </div>

        <svg className="ml-2 shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M9 18L15 12L9 6" stroke="#999694" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

export default function MypageScrapsPage() {
  const [activeTab, setActiveTab] = useState<ScrapTab>('Project');
  const [projects, setProjects] = useState<ScrapProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScraps = async () => {
      setLoading(true);
      try {
        const res = await fetch(SCRAP_ENDPOINT);
        if (!res.ok) throw new Error('fetch failed');
        const json = await res.json();
        const data: ScrapProject[] = json?.data?.projects ?? [];
        setProjects(data);
      } catch {
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    fetchScraps();
  }, [activeTab]);

  const cta = EMPTY_CTA;

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f6f6f5]">
      <NavBar variant="title-back" title="스크랩" />

      <div className="w-full border-b border-[#f1f1f1]">
        <div className="mx-auto w-full max-w-[375px]">
          <TabBar
            items={TAB_ITEMS}
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as ScrapTab)}
            className="bg-[#f6f6f5] py-0"
          />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-[375px] flex-1 flex-col px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-[13px] text-[#999694]">로딩 중...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <EmptyviewText title="스크랩한 글이 없습니다." subtext={false} />
            <Link
              href={cta.href}
              className="inline-flex h-[39px] w-[182px] items-center justify-center rounded-[8px] bg-[#f6874c] text-[15px] font-bold leading-[1.5] text-[#fdfdfd]"
            >
              {cta.label}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {projects.map((item) => (
              <ProjectCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
