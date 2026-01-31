type SkeletonProps = {
  className?: string;
};

const Skeleton = ({ className = "" }: SkeletonProps) => (
  <div className={`animate-pulse rounded bg-neutral-100 ${className}`} />
);

export default Skeleton;
