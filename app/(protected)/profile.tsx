import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../context/auth";

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  if (!user) return null;

  function handleSignOut() {
    signOut();
    router.replace("/sign-in");
  }

  return (
    <View style={styles.container}>
      <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
      <Text testID="profile_name" style={styles.name}>
        {user.name ?? user.login}
      </Text>
      {user.bio && (
        <Text testID="profile_bio" style={styles.bio}>
          {user.bio}
        </Text>
      )}
      <Text testID="profile_repos" style={styles.repos}>
        Public repos: {user.public_repos}
      </Text>
      <TouchableOpacity
        testID="sign_out_button"
        style={styles.button}
        onPress={handleSignOut}
      >
        <Text style={styles.buttonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  bio: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 8,
  },
  repos: {
    fontSize: 16,
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#333",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
