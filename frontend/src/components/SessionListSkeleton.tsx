import Skeleton from './Skeleton'

export default function SessionListSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/30">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-6 w-20 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-xl" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        <div className="px-2 py-1">
          <Skeleton className="h-4 w-12 rounded mb-2" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-3 rounded-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <Skeleton className="h-5 w-3/4 rounded mb-2" />
                <Skeleton className="h-4 w-1/3 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
