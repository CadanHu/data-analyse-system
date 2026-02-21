import Skeleton from './Skeleton'

export default function MessageSkeleton() {
  return (
    <div className="flex gap-3 py-4">
      <Skeleton className="flex-shrink-0 w-9 h-9 rounded-xl" />
      <div className="flex-1 max-w-[80%]">
        <Skeleton className="rounded-2xl h-24 w-full" />
      </div>
    </div>
  )
}
