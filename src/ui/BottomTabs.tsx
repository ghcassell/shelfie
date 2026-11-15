import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { IconName } from "./components";
import { color, font } from "./theme";

const icon =
    (name: IconName) =>
    ({ focused, size }: { focused: boolean; size: number }) => (
        <MaterialCommunityIcons
            name={name}
            size={size}
            color={focused ? color.primary : color.inkMuted}
        />
    );

/** Larder, Shopping, Needs attention (with badge). Settings and Waste report live in the Larder's overflow menu. */
export function BottomTabs({ attentionCount }: { attentionCount: number }) {
    const insets = useSafeAreaInsets();
    const pad = 4; // extra vertical padding on top of the default 49dp bar
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarHideOnKeyboard: true, // otherwise it rides on top of the keyboard (Larder search, Shopping add)
                tabBarActiveTintColor: color.primary,
                tabBarInactiveTintColor: color.inkMuted,
                tabBarLabelStyle: { fontSize: font.xs },
                tabBarStyle: {
                    borderTopColor: color.brand,
                    height: 49 + pad * 2 + insets.bottom,
                    paddingTop: pad,
                    paddingBottom: insets.bottom + pad,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "Larder",
                    tabBarIcon: icon("fridge-outline"),
                }}
            />
            <Tabs.Screen
                name="shopping"
                options={{
                    title: "Shopping",
                    tabBarIcon: icon("cart-outline"),
                }}
            />
            <Tabs.Screen
                name="attention"
                options={{
                    title: "Needs attention",
                    tabBarIcon: icon("alert-circle-outline"),
                    tabBarBadge: attentionCount || undefined,
                    tabBarBadgeStyle: {
                        backgroundColor: color.red,
                        color: "#fff",
                    },
                }}
            />
        </Tabs>
    );
}
