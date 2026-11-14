import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
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
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: color.primary,
                tabBarInactiveTintColor: color.inkMuted,
                tabBarLabelStyle: { fontSize: font.xs },
                tabBarStyle: { borderTopColor: color.line },
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
