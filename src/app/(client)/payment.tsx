import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '@/components/ambient-background';
import { IconCheck, IconChevronLeft, IconMapPin, IconPharmacie } from '@/components/icons';
import { ApplePayIcon, CardBrandIcon, PayPalIcon } from '@/components/payment-icons';
import { GlassCard } from '@/components/ui/glass-card';
import { FontFamily, Radius, Spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import type { Address } from '@/services/auth';
import { placeOrder, type OrderItem, type Ordonnance } from '@/services/orders';
import { addPaymentMethod, listenPaymentMethods, type PaymentMethod } from '@/services/payment-methods';
import { formatCardNumber, formatExpiry } from '@/utils/card-format';

// ── Card chip SVG-like visual ──────────────────────────────────────────────────
function CardChip() {
  return (
    <View style={chip.wrap}>
      <View style={chip.row}>
        <View style={chip.cell} />
        <View style={chip.cell} />
      </View>
      <View style={chip.line} />
      <View style={chip.row}>
        <View style={chip.cell} />
        <View style={chip.cell} />
      </View>
    </View>
  );
}

const chip = StyleSheet.create({
  wrap: {
    width: 36,
    height: 28,
    borderRadius: 5,
    backgroundColor: 'rgba(255,192,110,0.85)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    gap: 3,
    padding: 4,
  },
  row: { flexDirection: 'row', gap: 3 },
  cell: {
    flex: 1,
    height: 7,
    borderRadius: 1.5,
    backgroundColor: 'rgba(180,120,20,0.5)',
  },
  line: { height: 0.5, backgroundColor: 'rgba(180,120,20,0.4)' },
});

// ── Format helpers ─────────────────────────────────────────────────────────────
// Visual card mockup only ever reveals the last 4 digits typed — the rest
// stays masked even though the input field above shows the full number.
function maskCardDisplay(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '•••• •••• •••• ••••';
  const last4 = digits.slice(-4).padStart(4, '•');
  return `•••• •••• •••• ${last4}`;
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{
    pharmacyId: string;
    pharmacyName: string;
    pharmacyAddress: string;
    deliveryAddress: string;
    items: string;
    total: string;
    deliveryFee: string;
    hasOrdonnance: string;
    selectedPaymentMethod: string;
  }>();

  const items: OrderItem[] = params.items ? JSON.parse(params.items) : [];
  const [ordonnances, setOrdonnances] = useState<Ordonnance[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('pending_ordonnances').then((raw) => {
      if (raw) setOrdonnances(JSON.parse(raw));
    }).catch(() => {});
  }, []);
  const total = parseFloat(params.total ?? '0');
  const deliveryFee = parseFloat(params.deliveryFee ?? '4.90');
  const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const deliveryAddress: Address | null = params.deliveryAddress ? JSON.parse(params.deliveryAddress) : null;
  const selectedMethod = params.selectedPaymentMethod || 'new';

  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/26');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const [savedMethods, setSavedMethods] = useState<PaymentMethod[]>([]);
  const [saveCard, setSaveCard] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = listenPaymentMethods(user.uid, setSavedMethods);
    return unsub;
  }, [user]);

  const selectedSavedCard = savedMethods.find((m) => m.id === selectedMethod);
  const usingSavedOrSimulated = selectedMethod !== 'new';

  const cardScale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const expiryRef = useRef<TextInput>(null);
  const cvvRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  // Flip card face on CVV focus
  const [cvvFocused, setCvvFocused] = useState(false);

  async function handlePay() {
    if (!user || loading) return;
    setLoading(true);
    // Simulate network delay of 1.5s then place order
    await new Promise((r) => setTimeout(r, 1500));
    try {
      if (selectedMethod === 'new' && saveCard && cardNumber && expiry && name) {
        await addPaymentMethod(user.uid, savedMethods, { cardNumber, expiry, cardHolder: name }).catch(() => {});
      }
      const orderId = await placeOrder({
        clientId: user.uid,
        clientName: user.name,
        pharmacyId: params.pharmacyId ?? '',
        pharmacyName: params.pharmacyName ?? '',
        pharmacyAddress: params.pharmacyAddress ?? null,
        deliveryAddress,
        items,
        totalPrice: total,
        deliveryFee: parseFloat(params.deliveryFee ?? '4.90'),
        hasOrdonnance: params.hasOrdonnance === 'true',
        ordonnances,
      });
      await AsyncStorage.removeItem('pending_ordonnances');

      router.replace({
        pathname: '/(client)/success' as never,
        params: {
          orderId,
          pharmacyName: params.pharmacyName ?? '',
          total: params.total ?? '0',
          items: params.items ?? '[]',
          deliveryAddress: params.deliveryAddress ?? '',
        },
      });
    } catch {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <AmbientBackground />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top bar */}
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <IconChevronLeft size={18} color={colors.text.secondary} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.heading}>Paiement</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Order recap */}
        <GlassCard style={styles.orderRecap}>
          <View style={styles.recapPharmRow}>
            <IconPharmacie size={20} color={colors.amberBright} />
            <View style={styles.recapPharmInfo}>
              <Text style={styles.recapPharmName} numberOfLines={1}>{params.pharmacyName}</Text>
              {!!params.pharmacyAddress && (
                <Text style={styles.recapPharmAddr} numberOfLines={1}>{params.pharmacyAddress}</Text>
              )}
            </View>
          </View>

          <View style={styles.recapDivider} />

          <View style={styles.recapItems}>
            {items.map((item, idx) => (
              <View key={idx} style={styles.recapItemRow}>
                <Text style={styles.recapItemName} numberOfLines={1}>
                  {item.quantity}× {item.name}
                </Text>
                <Text style={styles.recapItemPrice}>{(item.price * item.quantity).toFixed(2)} €</Text>
              </View>
            ))}
          </View>

          <View style={styles.recapDivider} />

          <View style={styles.recapRow}>
            <Text style={styles.recapLabel}>Sous-total médicaments</Text>
            <Text style={styles.recapValue}>{subtotal.toFixed(2)} €</Text>
          </View>
          <View style={styles.recapRow}>
            <Text style={styles.recapLabel}>Frais de livraison</Text>
            <Text style={styles.recapValue}>{deliveryFee.toFixed(2)} €</Text>
          </View>

          <View style={styles.recapDivider} />

          <View style={styles.recapRow}>
            <Text style={styles.recapTotalLabel}>Total</Text>
            <Text style={styles.recapTotalValue}>{total.toFixed(2)} €</Text>
          </View>

          {deliveryAddress && (
            <>
              <View style={styles.recapDivider} />
              <View style={styles.recapAddressRow}>
                <IconMapPin size={15} color={colors.text.tertiary} strokeWidth={1.8} />
                <Text style={styles.recapAddressText} numberOfLines={1}>
                  {deliveryAddress.street}, {deliveryAddress.zipCode} {deliveryAddress.city}
                </Text>
                <Pressable onPress={() => router.back()} hitSlop={8}>
                  <Text style={styles.modifyLink}>Modifier</Text>
                </Pressable>
              </View>
            </>
          )}
        </GlassCard>

        {usingSavedOrSimulated ? (
          <GlassCard style={styles.simulatedPanel}>
            {selectedMethod === 'apple-pay' ? (
              <ApplePayIcon width={64} height={34} />
            ) : selectedMethod === 'paypal' ? (
              <PayPalIcon width={64} height={34} />
            ) : (
              <CardBrandIcon brand={selectedSavedCard?.type ?? 'other'} width={48} height={30} />
            )}
            <Text style={styles.simulatedText}>
              {selectedMethod === 'apple-pay'
                ? 'Paiement avec Apple Pay'
                : selectedMethod === 'paypal'
                  ? 'Paiement avec PayPal'
                  : `Carte enregistrée se terminant par ${selectedSavedCard?.last4}`}
            </Text>
          </GlassCard>
        ) : (
          <>
            {/* Card visual */}
            <Animated.View style={cardStyle}>
              <LinearGradient
                colors={['#2a1a06', '#1a1005', '#0f0a02']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardVisual}
              >
                {/* Shimmer overlay */}
                <LinearGradient
                  colors={['rgba(255,192,110,0.12)', 'transparent', 'rgba(255,192,110,0.06)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.cardTop}>
                  <CardChip />
                  <View style={styles.wifiIcon}>
                    {[0, 1, 2].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.wifiArc,
                          {
                            width: 8 + i * 6,
                            height: 8 + i * 6,
                            opacity: 0.3 + i * 0.25,
                            borderColor: colors.amberBright,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>
                <Text style={styles.cardNumber}>
                  {maskCardDisplay(cardNumber)}
                </Text>
                <View style={styles.cardBottom}>
                  <View>
                    <Text style={styles.cardMiniLabel}>TITULAIRE</Text>
                    <Text style={styles.cardMiniValue}>{name || 'VOTRE NOM'}</Text>
                  </View>
                  <View>
                    <Text style={styles.cardMiniLabel}>EXPIRE</Text>
                    <Text style={styles.cardMiniValue}>{expiry || 'MM/AA'}</Text>
                  </View>
                  {cvvFocused && (
                    <View>
                      <Text style={styles.cardMiniLabel}>CVV</Text>
                      <Text style={styles.cardMiniValue}>***</Text>
                    </View>
                  )}
                  <View style={styles.cardBrand}>
                    <View style={[styles.brandCircle, { backgroundColor: 'rgba(235,162,78,0.9)', marginRight: -8 }]} />
                    <View style={[styles.brandCircle, { backgroundColor: 'rgba(200,100,20,0.7)' }]} />
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* Form */}
            <GlassCard style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Numéro de carte</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={cardNumber}
                  onChangeText={(t) => {
                    setCardNumber(formatCardNumber(t));
                    cardScale.value = withSpring(1.01, { damping: 10 });
                    setTimeout(() => { cardScale.value = withSpring(1, { damping: 10 }); }, 150);
                    if (formatCardNumber(t).replace(/\s/g, '').length === 16) expiryRef.current?.focus();
                  }}
                  placeholder="1234 5678 9012 3456"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="numeric"
                  maxLength={19}
                  returnKeyType="next"
                  onSubmitEditing={() => expiryRef.current?.focus()}
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Expiration</Text>
                  <TextInput
                    ref={expiryRef}
                    style={styles.fieldInput}
                    value={expiry}
                    onChangeText={(t) => {
                      setExpiry(formatExpiry(t));
                      if (formatExpiry(t).length === 5) cvvRef.current?.focus();
                    }}
                    placeholder="MM/AA"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="numeric"
                    maxLength={5}
                    returnKeyType="next"
                    onSubmitEditing={() => cvvRef.current?.focus()}
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>CVV</Text>
                  <TextInput
                    ref={cvvRef}
                    style={styles.fieldInput}
                    value={cvv}
                    onChangeText={setCvv}
                    placeholder="•••"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="numeric"
                    maxLength={3}
                    secureTextEntry
                    returnKeyType="next"
                    onFocus={() => setCvvFocused(true)}
                    onBlur={() => setCvvFocused(false)}
                    onSubmitEditing={() => nameRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Nom sur la carte</Text>
                <TextInput
                  ref={nameRef}
                  style={styles.fieldInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="JEAN DUPONT"
                  placeholderTextColor={colors.text.tertiary}
                  autoCapitalize="characters"
                  returnKeyType="done"
                />
              </View>
            </GlassCard>

            <Pressable
              onPress={() => setSaveCard((v) => !v)}
              style={({ pressed }) => [styles.saveCardRow, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.checkbox, saveCard && styles.checkboxChecked]}>
                {saveCard && <IconCheck size={12} color="#221204" strokeWidth={3} />}
              </View>
              <Text style={styles.saveCardLabel}>Enregistrer cette carte</Text>
            </Pressable>
          </>
        )}

      </ScrollView>

      {/* Footer CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handlePay}
          disabled={loading}
          style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={['#ffc06e', '#d08036']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.payBtnGrad}
          >
            {loading ? (
              <ActivityIndicator color="#221204" size="small" />
            ) : (
              <Text style={styles.payBtnLabel}>Payer {total.toFixed(2)} €</Text>
            )}
          </LinearGradient>
        </Pressable>
        <Text style={styles.secureNote}>🔒 Paiement sécurisé SSL</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.surface },
    content: { paddingHorizontal: Spacing.xl },
    topbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.glass,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heading: {
      fontFamily: FontFamily.serif,
      fontSize: 18,
      color: colors.text.primary,
    },
    cardVisual: {
      borderRadius: 20,
      padding: 22,
      marginBottom: 20,
      gap: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,192,110,0.15)',
      overflow: 'hidden',
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    wifiIcon: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wifiArc: {
      position: 'absolute',
      borderRadius: 50,
      borderWidth: 1.5,
      borderTopColor: 'transparent',
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      transform: [{ rotate: '-45deg' }],
    },
    cardNumber: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 20,
      color: 'rgba(255,255,255,0.9)',
      letterSpacing: 2,
    },
    cardBottom: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    cardMiniLabel: {
      fontFamily: FontFamily.sansExtraBold,
      fontSize: 8,
      color: 'rgba(255,255,255,0.4)',
      letterSpacing: 1.2,
      marginBottom: 3,
    },
    cardMiniValue: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13,
      color: 'rgba(255,255,255,0.85)',
      letterSpacing: 0.5,
    },
    cardBrand: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    brandCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    form: {
      padding: 18,
      borderRadius: Radius.lg,
      gap: 18,
      marginBottom: 14,
    },
    fieldRow: {
      flexDirection: 'row',
      gap: 12,
    },
    field: { gap: 8 },
    fieldLabel: {
      fontFamily: FontFamily.sansExtraBold,
      fontSize: 10.5,
      color: colors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    fieldInput: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 15,
      color: colors.text.primary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.glass,
      paddingBottom: 8,
    },
    modifyLink: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13,
      color: colors.amberBright,
    },
    simulatedPanel: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      paddingVertical: 36,
      borderRadius: Radius.lg,
      marginBottom: 14,
    },
    simulatedText: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 13.5,
      color: colors.text.secondary,
    },
    saveCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
      marginBottom: 8,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.border.glass,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.amberBright,
      borderColor: colors.amberBright,
    },
    saveCardLabel: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 13.5,
      color: colors.text.secondary,
    },
    orderRecap: {
      padding: 16,
      borderRadius: Radius.lg,
      gap: 10,
      marginBottom: 20,
    },
    recapPharmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    recapPharmInfo: { flex: 1, gap: 2 },
    recapPharmName: {
      fontFamily: FontFamily.sansBold,
      fontSize: 14.5,
      color: colors.text.primary,
    },
    recapPharmAddr: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 11.5,
      color: colors.text.tertiary,
    },
    recapDivider: {
      height: 1,
      backgroundColor: colors.border.glass,
    },
    recapItems: { gap: 6 },
    recapItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    recapItemName: {
      flex: 1,
      fontFamily: FontFamily.sansMedium,
      fontSize: 13,
      color: colors.text.secondary,
    },
    recapItemPrice: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13,
      color: colors.text.primary,
    },
    recapRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    recapLabel: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 13,
      color: colors.text.secondary,
    },
    recapValue: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13,
      color: colors.text.primary,
    },
    recapTotalLabel: {
      fontFamily: FontFamily.sansBold,
      fontSize: 15,
      color: colors.text.primary,
    },
    recapTotalValue: {
      fontFamily: FontFamily.serif,
      fontSize: 21,
      color: colors.amberBright,
    },
    recapAddressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    recapAddressText: {
      flex: 1,
      fontFamily: FontFamily.sansMedium,
      fontSize: 12,
      color: colors.text.tertiary,
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: Spacing.xl,
      paddingTop: 10,
      gap: 10,
      alignItems: 'center',
    },
    payBtn: { width: '100%' },
    payBtnGrad: {
      borderRadius: Radius.pill,
      paddingVertical: 17,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#ffc06e',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    },
    payBtnLabel: {
      fontFamily: FontFamily.sansBold,
      fontSize: 16,
      color: '#221204',
      letterSpacing: 0.2,
    },
    secureNote: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 11.5,
      color: colors.text.tertiary,
    },
  });
}
