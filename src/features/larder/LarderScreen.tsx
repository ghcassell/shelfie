import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
    FlatList,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    View,
} from "react-native";
import { useLarder } from "../../db/queries";
import { matchesSearch } from "../../domain/larder";
import { sync, useSyncStatus } from "../../sync";
import {
    Banner,
    Chip,
    EmptyState,
    FAB,
    ListRow,
    s,
    ScreenHeader,
    Sheet,
} from "../../ui/components";
import { color, space } from "../../ui/theme";
import { BatchItem } from "./BatchItem";

export default function LarderScreen() {
    const { larder, attention, locations, today } = useLarder();
    const { status } = useSyncStatus();
    const [query, setQuery] = useState("");
    const [locationId, setLocationId] = useState<string | null>(null);
    const [openedOnly, setOpenedOnly] = useState(false);
    const [adding, setAdding] = useState(false);

    const rows = larder.filter(
        (r) =>
            matchesSearch(r, query) &&
            (!locationId || r.batch.locationId === locationId) &&
            (!openedOnly || !!r.batch.openedOn),
    );
    const filtered = !!query || !!locationId || openedOnly;
    const anyExpired = attention.some((r) => r.urgency === "expired");
    const go = (path: "/add" | "/add?several=1" | "/receipt") => {
        setAdding(false);
        router.push(path);
    };

    return (
        <View style={s.screen}>
            <ScreenHeader
                title="Shelfie"
                logo
                menu={[
                    {
                        label: "Settings",
                        onPress: () => router.push("/settings"),
                    },
                    {
                        label: "Waste report",
                        onPress: () => router.push("/waste"),
                    },
                    // The table needs a wide window, so only the browser offers it.
                    ...(Platform.OS === "web"
                        ? [
                              {
                                  label: "Tidy up (table)",
                                  onPress: () => router.push("/tidy"),
                              },
                          ]
                        : []),
                ]}
            >
            {larder.length > 0 && (
                <>
                    <View
                        style={{
                            marginHorizontal: space.screen,
                            justifyContent: "center",
                        }}
                    >
                        <TextInput
                            style={[s.input, { paddingRight: 44 }]}
                            placeholder="Search name or brand"
                            placeholderTextColor={color.placeholder}
                            value={query}
                            onChangeText={setQuery}
                            accessibilityLabel="Search the larder"
                            returnKeyType="search"
                        />
                        <MaterialCommunityIcons
                            name="magnify"
                            size={22}
                            color={color.placeholder}
                            style={{
                                position: "absolute",
                                right: space.md,
                                pointerEvents: "none",
                            }}
                        />
                    </View>
                    <View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{
                                gap: space.sm,
                                paddingHorizontal: space.screen,
                            }}
                        >
                            {locations.map((l) => (
                                <Chip
                                    key={l.id}
                                    label={l.name}
                                    selected={locationId === l.id}
                                    onPress={() =>
                                        setLocationId(
                                            locationId === l.id ? null : l.id,
                                        )
                                    }
                                />
                            ))}
                            <Chip
                                label="Opened"
                                selected={openedOnly}
                                onPress={() => setOpenedOnly(!openedOnly)}
                            />
                        </ScrollView>
                    </View>
                </>
            )}
            {attention.length > 0 && (
                <Banner
                    tone={anyExpired ? "red" : "amber"}
                    text={`${attention.length} ${attention.length === 1 ? "needs" : "need"} attention`}
                    onPress={() => router.push("/attention")}
                />
            )}
            </ScreenHeader>
            <FlatList
                data={rows}
                keyExtractor={(r) => r.batch.id}
                renderItem={({ item }) => (
                    <BatchItem row={item} today={today} />
                )}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}
                refreshControl={
                    <RefreshControl
                        refreshing={status === "syncing"}
                        onRefresh={sync}
                    />
                }
                ListEmptyComponent={
                    filtered ? (
                        <EmptyState
                            icon="filter-off-outline"
                            text="Nothing matches."
                            actionLabel="Clear filters"
                            onAction={() => {
                                setQuery("");
                                setLocationId(null);
                                setOpenedOnly(false);
                            }}
                        />
                    ) : (
                        <EmptyState
                            icon="barcode-scan"
                            text="Your larder is empty. Scan your first item."
                            actionLabel="Scan"
                            onAction={() => router.push("/add")}
                        />
                    )
                }
            />
            <FAB label="Add to the larder" onPress={() => setAdding(true)} />
            <Sheet
                visible={adding}
                onClose={() => setAdding(false)}
                title="Add"
            >
                <ListRow
                    title="Add one"
                    subtitle="Scan a barcode or enter by hand"
                    onPress={() => go("/add")}
                />
                <ListRow
                    title="Add several"
                    subtitle="Keep scanning after a big shop"
                    onPress={() => go("/add?several=1")}
                />
                <ListRow
                    title="Scan a receipt"
                    subtitle="Add everything on a till receipt"
                    onPress={() => go("/receipt")}
                />
            </Sheet>
        </View>
    );
}
