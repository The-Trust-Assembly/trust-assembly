import { getHello } from "./backend/api";
import { useQuery } from "@tanstack/react-query";

export default function Hello() {
  const { isLoading, data: message } = useQuery({
    queryKey: ["hello"],
    queryFn: getHello,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>{message}</h1>
    </div>
  )
}