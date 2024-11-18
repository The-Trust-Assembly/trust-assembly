import { getHello } from "./backend/api";
import { useSuspenseQuery } from "@tanstack/react-query";

export default function Hello() {
  const { data: message } = useSuspenseQuery({
    queryKey: ["hello"],
    queryFn: getHello,
  });

  return (
    <div>
      <h1>{message}</h1>
    </div>
  )
}
