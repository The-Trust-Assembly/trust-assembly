import { Link } from "react-router-dom";

type LogoProps = Omit<React.ComponentProps<typeof Link>, 'to'>;

export default function Logo(props: LogoProps) {
  return (
    <Link to="/" {...props}>
      <div className="flex shrink-0 items-center">
        <img className="h-8 w-auto" src="/gavel.jpg" alt="Trust Assembly" />
        <strong className="pl-2 text-lg">Trust Assembly</strong>
      </div>
    </Link>
  );
}
