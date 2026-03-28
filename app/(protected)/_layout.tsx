import { Redirect, Slot } from "expo-router";
import { useAuth } from "../../context/auth";

export default function ProtectedLayout() {
  const { user } = useAuth();

  if (!user) {
    return <Redirect href="/sign-in" />;
  }

  return <Slot />;
}
