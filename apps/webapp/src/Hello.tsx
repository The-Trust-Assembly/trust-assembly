import { useEffect, useState } from "react";
import { getHello } from "./backend/api";

export default function Hello() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHello()
      .then((msg) => setMessage(msg))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>{message}</h1>
    </div>
  )
}