type SkeletonProps = {
  className?: string;
};

const Skeleton = ({ className = "" }: SkeletonProps) => (
  <div className={`skeleton-block rounded ${className}`} />
);

export default Skeleton;
