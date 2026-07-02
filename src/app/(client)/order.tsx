import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackground } from '@/components/ambient-background';
import { AddressPickerSheet } from '@/components/client/address-picker-sheet';
import {
  IconCamera,
  IconCheck,
  IconChevronLeft,
  IconDocument,
  IconImage,
  IconMapPin,
  IconPharmacie,
  IconPlus,
  IconSearch,
  IconUpload,
} from '@/components/icons';
import { ApplePayIcon, CardBrandIcon, PayPalIcon } from '@/components/payment-icons';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { GlassCard } from '@/components/ui/glass-card';
import { PrimaryButton } from '@/components/ui/primary-button';
import { DELIVERY_FEE } from '@/constants/fees';
import { FontFamily, Radius, Spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { listenUserAddresses } from '@/services/addresses';
import type { ClientAddress } from '@/services/auth';
import { listenPaymentMethods, type PaymentMethod } from '@/services/payment-methods';
import { getPharmacy, type PharmacyDoc } from '@/services/pharmacies';
import { listenPharmacyProducts, type ProductDoc } from '@/services/products';

type Method = 'ordonnance' | 'catalogue';
type SelectedPaymentMethod = 'new' | 'apple-pay' | 'paypal' | string;

function QtyStepper({
  qty,
  max,
  onChange,
  styles,
}: {
  qty: number;
  max: number;
  onChange: (next: number) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const atMax = qty >= max;
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(0, qty - 1))}
        style={styles.stepperBtn}
        disabled={qty === 0}
      >
        <Text style={[styles.stepperBtnText, qty === 0 && { opacity: 0.3 }]}>—</Text>
      </Pressable>
      <Text style={styles.stepperQty}>{qty}</Text>
      <Pressable onPress={() => onChange(Math.min(max, qty + 1))} style={styles.stepperBtn} disabled={atMax}>
        <Text style={[styles.stepperBtnText, atMax && { opacity: 0.3 }]}>+</Text>
      </Pressable>
    </View>
  );
}

export default function OrderScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pharmacyId, pharmacyName } = useLocalSearchParams<{
    pharmacyId: string;
    pharmacyName: string;
  }>();

  const [addresses, setAddresses] = useState<ClientAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [pharmacy, setPharmacy] = useState<PharmacyDoc | null>(null);
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<Method>('catalogue');
  const [ordonnances, setOrdonnances] = useState<Array<{ title: string; base64: string; type: 'image' | 'pdf'; name: string }>>([]);
  const [processingOrdonnance, setProcessingOrdonnance] = useState(false);
  const [addingOrdonnance, setAddingOrdonnance] = useState(false);
  const [pendingTitle, setPendingTitle] = useState('');
  const [search, setSearch] = useState('');

  const [savedMethods, setSavedMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SelectedPaymentMethod>('new');
  const [methodSheetVisible, setMethodSheetVisible] = useState(false);
  const defaultPicked = useRef(false);

  useEffect(() => {
    if (!user) return;
    const unsub = listenUserAddresses(user.uid, setAddresses);
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = listenPaymentMethods(user.uid, (methods) => {
      setSavedMethods(methods);
      if (!defaultPicked.current && methods.length > 0) {
        defaultPicked.current = true;
        const def = methods.find((m) => m.isDefault);
        setSelectedPaymentMethod(def?.id ?? methods[0].id);
      }
    });
    return unsub;
  }, [user]);

  const selectedSavedCard = savedMethods.find((m) => m.id === selectedPaymentMethod);

  // Keeps the selection pinned to the default address until the user picks another one
  useEffect(() => {
    if (selectedAddressId && addresses.some((a) => a.id === selectedAddressId)) return;
    const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
    setSelectedAddressId(defaultAddress?.id ?? null);
  }, [addresses, selectedAddressId]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;
  const hasAddress = !!selectedAddress;

  const filteredProducts = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search],
  );

  useEffect(() => {
    if (!pharmacyId) return;
    getPharmacy(pharmacyId).then(setPharmacy).catch(() => {});
    const unsub = listenPharmacyProducts(pharmacyId, setProducts);
    return unsub;
  }, [pharmacyId]);

  const cartItems = useMemo(
    () => products.filter((p) => (quantities[p.id] ?? 0) > 0),
    [products, quantities],
  );
  const cartHasOrdonnanceItem = cartItems.some((p) => p.requiresOrdonnance);
  const needsOrdonnance = method === 'ordonnance' || cartHasOrdonnanceItem;
  const hasOrdonnance = ordonnances.length > 0;
  const exceedsStock = cartItems.some((p) => (quantities[p.id] ?? 0) > p.stock);

  const total = useMemo(
    () => cartItems.reduce((acc, p) => acc + p.price * (quantities[p.id] ?? 0), 0),
    [cartItems, quantities],
  );
  const grandTotal = total + DELIVERY_FEE;

  const setQty = (productId: string, next: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: next }));
  };

  const handlePay = async () => {
    if (!hasAddress || !selectedAddress) {
      Alert.alert(
        'Adresse manquante',
        'Ajoutez une adresse de livraison avant de payer.',
      );
      return;
    }
    if (cartItems.length === 0 && !hasOrdonnance) {
      Alert.alert(
        'Panier vide',
        'Ajoutez au moins un produit du catalogue ou transmettez une ordonnance.',
      );
      return;
    }
    if (needsOrdonnance && !hasOrdonnance) {
      Alert.alert(
        'Ordonnance requise',
        'Un ou plusieurs produits nécessitent une ordonnance. Merci de la transmettre avant de payer.',
      );
      return;
    }
    if (exceedsStock) {
      Alert.alert(
        'Stock insuffisant',
        'Le stock disponible a changé. Ajustez les quantités avant de payer.',
      );
      return;
    }
    const items = cartItems.map((p) => ({
      productId: p.id,
      name: p.name,
      quantity: quantities[p.id] ?? 0,
      price: p.price,
    }));
    // Ordonnances contain large base64 payloads — too big for URL params.
    // Store them in AsyncStorage and read them back in payment.tsx.
    await AsyncStorage.setItem('pending_ordonnances', JSON.stringify(ordonnances));
    router.push({
      pathname: '/(client)/payment' as never,
      params: {
        pharmacyId: pharmacyId ?? '',
        pharmacyName: pharmacy?.name ?? pharmacyName ?? '',
        pharmacyAddress: pharmacy?.address ?? '',
        deliveryAddress: JSON.stringify({
          street: selectedAddress.street,
          zipCode: selectedAddress.zipCode,
          city: selectedAddress.city,
        }),
        items: JSON.stringify(items),
        total: String(grandTotal.toFixed(2)),
        deliveryFee: String(DELIVERY_FEE),
        hasOrdonnance: needsOrdonnance ? 'true' : 'false',
        selectedPaymentMethod,
      },
    });
  };

  // Resizes to max 1200px wide @ quality 0.7 — keeps the doc well under
  // Firestore's 1MiB document limit once base64-encoded (~33% size overhead).
  async function resizeImageToBase64(uri: string): Promise<string> {
    const image = await ImageManipulator.manipulate(uri).resize({ width: 1200 }).renderAsync();
    const result = await image.saveAsync({
      compress: 0.7,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (!result.base64) throw new Error('No base64 output from image manipulator');
    return result.base64;
  }

  function addOrdonnanceWithTitle(base64: string, type: 'image' | 'pdf', name: string) {
    const title = pendingTitle.trim() || `Ordonnance ${ordonnances.length + 1}`;
    setOrdonnances((prev) => [...prev, { title, base64, type, name }]);
    setPendingTitle('');
    setAddingOrdonnance(false);
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission refusée', "L'accès à la caméra est nécessaire pour prendre une photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setProcessingOrdonnance(true);
    try {
      const base64 = await resizeImageToBase64(result.assets[0].uri);
      addOrdonnanceWithTitle(base64, 'image', `ordonnance_${Date.now()}.jpg`);
    } catch {
      Alert.alert('Erreur', "La photo n'a pas pu être traitée.");
    } finally {
      setProcessingOrdonnance(false);
    }
  }

  async function handlePickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission refusée', "L'accès à la galerie est nécessaire pour choisir une photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setProcessingOrdonnance(true);
    try {
      const base64 = await resizeImageToBase64(result.assets[0].uri);
      addOrdonnanceWithTitle(base64, 'image', `ordonnance_${Date.now()}.jpg`);
    } catch {
      Alert.alert('Erreur', "La photo n'a pas pu être traitée.");
    } finally {
      setProcessingOrdonnance(false);
    }
  }

  async function handlePickPdf() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setProcessingOrdonnance(true);
    try {
      const base64 = await new File(asset.uri).base64();
      addOrdonnanceWithTitle(base64, 'pdf', asset.name);
    } catch {
      Alert.alert('Erreur', "Le fichier n'a pas pu être traité.");
    } finally {
      setProcessingOrdonnance(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <AmbientBackground />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <IconChevronLeft size={18} color={colors.text.secondary} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.heading}>Nouvelle commande</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Delivery address */}
        {selectedAddress ? (
          <GlassCard style={styles.addressCard}>
            <View style={styles.addressIconWrap}>
              <IconMapPin size={18} color={colors.amberBright} strokeWidth={1.8} />
            </View>
            <View style={styles.addressInfo}>
              <Text style={styles.addressLabel}>{selectedAddress.label}</Text>
              <Text style={styles.addressText} numberOfLines={1}>
                {selectedAddress.street}, {selectedAddress.zipCode} {selectedAddress.city}
              </Text>
            </View>
            <Pressable onPress={() => setAddressSheetOpen(true)} hitSlop={8}>
              <Text style={styles.addressEditLink}>Modifier</Text>
            </Pressable>
          </GlassCard>
        ) : (
          <GlassCard style={styles.addressCard}>
            <View style={styles.addressIconWrap}>
              <IconMapPin size={18} color={colors.text.tertiary} strokeWidth={1.8} />
            </View>
            <Text style={styles.addressEmptyText}>Aucune adresse de livraison enregistrée</Text>
            <Pressable onPress={() => router.push('/(client)/mes-adresses' as never)} hitSlop={8}>
              <Text style={styles.addressEditLink}>Ajouter</Text>
            </Pressable>
          </GlassCard>
        )}

        {/* Pharmacy banner */}
        <GlassCard strong style={styles.pharmBanner}>
          <View style={styles.pharmBannerInner}>
            <View style={styles.pharmIconWrap}>
              <IconPharmacie size={26} color={colors.amberBright} />
            </View>
            <View style={styles.pharmBannerInfo}>
              {pharmacy ? (
                <>
                  <Text style={styles.pharmBannerName}>{pharmacy.name}</Text>
                  <Text style={styles.pharmBannerAddr}>{pharmacy.address}</Text>
                  <View style={styles.pharmOpenRow}>
                    <View style={[styles.dot, { backgroundColor: pharmacy.isOpen ? colors.sage : colors.text.tertiary }]} />
                    <Text style={[styles.pharmOpenText, { color: pharmacy.isOpen ? colors.sageBright : colors.text.tertiary }]}>
                      {pharmacy.isOpen ? 'Ouvert' : 'Fermé'}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.pharmBannerName}>{pharmacyName || 'Chargement…'}</Text>
                  <ActivityIndicator size="small" color={colors.amberBright} style={{ marginTop: 4, alignSelf: 'flex-start' }} />
                </>
              )}
            </View>
          </View>
        </GlassCard>

        {/* Method toggle */}
        <Text style={styles.sectionLabel}>Méthode de commande</Text>
        <View style={styles.methodRow}>
          <Pressable
            style={[styles.methodBtn, method === 'catalogue' && styles.methodBtnActive]}
            onPress={() => setMethod('catalogue')}
          >
            {method === 'catalogue' && (
              <LinearGradient
                colors={['#ffc06e', '#c9821f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <IconDocument
              size={16}
              color={method === 'catalogue' ? '#221204' : colors.text.tertiary}
              strokeWidth={1.8}
            />
            <Text style={[styles.methodLabel, method === 'catalogue' && styles.methodLabelActive]}>
              Catalogue
            </Text>
          </Pressable>
          <Pressable
            style={[styles.methodBtn, method === 'ordonnance' && styles.methodBtnActive]}
            onPress={() => setMethod('ordonnance')}
          >
            {method === 'ordonnance' && (
              <LinearGradient
                colors={['#ffc06e', '#c9821f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <IconUpload
              size={16}
              color={method === 'ordonnance' ? '#221204' : colors.text.tertiary}
              strokeWidth={2}
            />
            <Text style={[styles.methodLabel, method === 'ordonnance' && styles.methodLabelActive]}>
              Ordonnance
            </Text>
          </Pressable>
        </View>

        {/* Upload zone */}
        {needsOrdonnance && (
          <>
            <Text style={styles.sectionLabel}>Ordonnances jointes</Text>

            {/* List of already-added ordonnances */}
            {ordonnances.map((ord, idx) => (
              <GlassCard key={idx} style={styles.uploadDone}>
                {ord.type === 'image' ? (
                  <Image source={{ uri: `data:image/jpeg;base64,${ord.base64}` }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbDoc]}>
                    <IconDocument size={22} color={colors.sage} strokeWidth={1.6} />
                  </View>
                )}
                <View style={styles.uploadDoneInfo}>
                  <Text style={styles.uploadTitle}>{ord.title}</Text>
                  <Text style={styles.uploadSub} numberOfLines={1}>{ord.name}</Text>
                </View>
                <Pressable onPress={() => setOrdonnances((prev) => prev.filter((_, i) => i !== idx))}>
                  <Text style={styles.removeLink}>Retirer</Text>
                </Pressable>
              </GlassCard>
            ))}

            {/* Processing spinner */}
            {processingOrdonnance && (
              <GlassCard style={styles.uploadDone}>
                <ActivityIndicator size="small" color={colors.amberBright} />
                <Text style={styles.uploadTitle}>Traitement en cours…</Text>
              </GlassCard>
            )}

            {/* Title input for next ordonnance */}
            {addingOrdonnance && !processingOrdonnance && (
              <GlassCard style={[styles.uploadDone, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
                <Text style={styles.uploadTitle}>Titre de l'ordonnance</Text>
                <TextInput
                  style={[styles.uploadSub, { borderBottomWidth: 1, borderBottomColor: colors.border.glass, width: '100%', paddingBottom: 6, color: colors.text.primary }]}
                  value={pendingTitle}
                  onChangeText={setPendingTitle}
                  placeholder={`Ordonnance ${ordonnances.length + 1}`}
                  placeholderTextColor={colors.text.tertiary}
                  autoFocus
                />
                <View style={styles.uploadBtnRow}>
                  <Pressable onPress={handleTakePhoto} style={{ flex: 1 }}>
                    <GlassCard style={styles.uploadBtn}>
                      <IconCamera size={20} color={colors.amberBright} strokeWidth={1.8} />
                      <Text style={styles.uploadBtnText}>Photo</Text>
                    </GlassCard>
                  </Pressable>
                  <Pressable onPress={handlePickFromGallery} style={{ flex: 1 }}>
                    <GlassCard style={styles.uploadBtn}>
                      <IconImage size={20} color={colors.amberBright} strokeWidth={1.8} />
                      <Text style={styles.uploadBtnText}>Galerie</Text>
                    </GlassCard>
                  </Pressable>
                  <Pressable onPress={handlePickPdf} style={{ flex: 1 }}>
                    <GlassCard style={styles.uploadBtn}>
                      <IconDocument size={20} color={colors.amberBright} strokeWidth={1.8} />
                      <Text style={styles.uploadBtnText}>PDF</Text>
                    </GlassCard>
                  </Pressable>
                </View>
                <Pressable onPress={() => { setAddingOrdonnance(false); setPendingTitle(''); }}>
                  <Text style={styles.removeLink}>Annuler</Text>
                </Pressable>
              </GlassCard>
            )}

            {/* Add another ordonnance button */}
            {!addingOrdonnance && !processingOrdonnance && (
              <Pressable onPress={() => setAddingOrdonnance(true)}>
                <GlassCard style={[styles.uploadBtn, { flexDirection: 'row', gap: 8, justifyContent: 'center' }]}>
                  <IconPlus size={16} color={colors.amberBright} strokeWidth={2} />
                  <Text style={styles.uploadBtnText}>
                    {ordonnances.length === 0 ? 'Ajouter une ordonnance' : 'Ajouter une autre ordonnance'}
                  </Text>
                </GlassCard>
              </Pressable>
            )}
          </>
        )}

        {/* Catalogue / cart */}
        {method === 'catalogue' && (
          <>
            <Text style={styles.sectionLabel}>Catalogue</Text>
            <GlassCard style={styles.searchBar}>
              <IconSearch size={16} color={colors.text.tertiary} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un médicament…"
                placeholderTextColor={colors.text.tertiary}
                value={search}
                onChangeText={setSearch}
              />
            </GlassCard>
            <View style={styles.cartList}>
              {filteredProducts.map((p) => {
                const qty = quantities[p.id] ?? 0;
                const outOfStock = p.stock <= 0;
                const effectiveMax = Math.min(p.stock, 5);
                const overStock = !outOfStock && qty > p.stock;
                return (
                  <GlassCard key={p.id} style={[styles.cartItem, outOfStock && styles.cartItemOut]}>
                    <View style={styles.cartItemLeft}>
                      <Text style={[styles.cartItemName, outOfStock && styles.textMuted]} numberOfLines={1}>{p.name}</Text>
                      <View style={styles.cartItemMetaRow}>
                        <Text style={styles.cartItemDose}>{(p.price ?? 0).toFixed(2)} €</Text>
                        {p.requiresOrdonnance && (
                          <View style={styles.rxBadge}>
                            <IconDocument size={11} color={colors.sageBright} strokeWidth={2} />
                            <Text style={styles.rxBadgeText}>Ordonnance requise</Text>
                          </View>
                        )}
                      </View>
                      {overStock && (
                        <Text style={styles.stockWarning}>Seulement {p.stock} disponible(s)</Text>
                      )}
                    </View>
                    {outOfStock ? (
                      <View style={styles.outBadge}>
                        <Text style={styles.outBadgeText}>Rupture de stock</Text>
                      </View>
                    ) : (
                      <QtyStepper qty={qty} max={effectiveMax} onChange={(next) => setQty(p.id, next)} styles={styles} />
                    )}
                  </GlassCard>
                );
              })}
              {filteredProducts.length === 0 && (
                <Text style={styles.emptyText}>Aucun produit disponible pour cette pharmacie</Text>
              )}
            </View>
          </>
        )}

        {/* Price summary */}
        <GlassCard style={styles.priceSummary}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Médicaments</Text>
            <Text style={styles.priceValue}>{total.toFixed(2)} €</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Frais de livraison</Text>
            <Text style={styles.priceValue}>{DELIVERY_FEE.toFixed(2)} €</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceRow}>
            <Text style={styles.priceTotalLabel}>Total</Text>
            <Text style={styles.priceTotalValue}>{grandTotal.toFixed(2)} €</Text>
          </View>
        </GlassCard>

        {/* Payment method selection */}
        <Text style={styles.sectionLabel}>Moyen de paiement</Text>
        <GlassCard style={styles.payWithCard}>
          <View style={styles.payWithRow}>
            {selectedPaymentMethod === 'apple-pay' ? (
              <ApplePayIcon width={44} height={26} />
            ) : selectedPaymentMethod === 'paypal' ? (
              <PayPalIcon width={44} height={26} />
            ) : selectedSavedCard ? (
              <CardBrandIcon brand={selectedSavedCard.type} width={36} height={24} />
            ) : null}
            <Text style={styles.payWithLabel} numberOfLines={1}>
              {selectedPaymentMethod === 'apple-pay'
                ? 'Apple Pay'
                : selectedPaymentMethod === 'paypal'
                  ? 'PayPal'
                  : selectedSavedCard
                    ? `•••• •••• •••• ${selectedSavedCard.last4}`
                    : 'Payer par carte'}
            </Text>
            <Pressable onPress={() => setMethodSheetVisible(true)} hitSlop={8}>
              <Text style={styles.addressEditLink}>Modifier</Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {!hasAddress && (
          <Text style={styles.addressWarning}>
            Ajoutez une adresse de livraison pour pouvoir commander
          </Text>
        )}
        <PrimaryButton
          label={`Confirmer et payer ${grandTotal.toFixed(2)} €`}
          onPress={handlePay}
          disabled={!hasAddress || (needsOrdonnance && !hasOrdonnance) || exceedsStock}
        />
      </View>

      <AddressPickerSheet
        visible={addressSheetOpen}
        onClose={() => setAddressSheetOpen(false)}
        addresses={addresses}
        selectedId={selectedAddressId}
        onSelect={(address) => setSelectedAddressId(address.id)}
      />

      <BottomSheet visible={methodSheetVisible} onClose={() => setMethodSheetVisible(false)}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Choisir un moyen de paiement</Text>
          {savedMethods.map((method) => (
            <Pressable
              key={method.id}
              onPress={() => { setSelectedPaymentMethod(method.id); setMethodSheetVisible(false); }}
              style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}
            >
              <CardBrandIcon brand={method.type} width={36} height={24} />
              <Text style={styles.sheetRowLabel}>•••• {method.last4}</Text>
              {selectedPaymentMethod === method.id && <IconCheck size={16} color={colors.amberBright} strokeWidth={2.3} />}
            </Pressable>
          ))}
          <Pressable
            onPress={() => { setSelectedPaymentMethod('new'); setMethodSheetVisible(false); }}
            style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}
          >
            <IconPlus size={18} color={colors.text.secondary} strokeWidth={2} />
            <Text style={styles.sheetRowLabel}>Nouvelle carte</Text>
            {selectedPaymentMethod === 'new' && <IconCheck size={16} color={colors.amberBright} strokeWidth={2.3} />}
          </Pressable>
          <Pressable
            onPress={() => { setSelectedPaymentMethod('apple-pay'); setMethodSheetVisible(false); }}
            style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}
          >
            <ApplePayIcon width={36} height={24} />
            <Text style={styles.sheetRowLabel}>Apple Pay</Text>
            {selectedPaymentMethod === 'apple-pay' && <IconCheck size={16} color={colors.amberBright} strokeWidth={2.3} />}
          </Pressable>
          <Pressable
            onPress={() => { setSelectedPaymentMethod('paypal'); setMethodSheetVisible(false); }}
            style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}
          >
            <PayPalIcon width={36} height={24} />
            <Text style={styles.sheetRowLabel}>PayPal</Text>
            {selectedPaymentMethod === 'paypal' && <IconCheck size={16} color={colors.amberBright} strokeWidth={2.3} />}
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.surface,
    },
    content: {
      paddingHorizontal: Spacing.xl,
    },
    topbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 22,
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
    addressCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: Radius.lg,
      marginBottom: 16,
    },
    addressIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.amberSoft,
      borderWidth: 1,
      borderColor: 'rgba(235,162,78,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    addressInfo: { flex: 1, gap: 2 },
    addressLabel: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13.5,
      color: colors.text.primary,
    },
    addressText: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 12,
      color: colors.text.tertiary,
    },
    addressEmptyText: {
      flex: 1,
      fontFamily: FontFamily.sansMedium,
      fontSize: 12.5,
      color: colors.text.tertiary,
    },
    addressEditLink: {
      fontFamily: FontFamily.sansBold,
      fontSize: 12.5,
      color: colors.amberBright,
    },
    pharmBanner: {
      marginBottom: 24,
      borderRadius: Radius.lg,
      padding: 16,
    },
    pharmBannerInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    pharmIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.amberSoft,
      borderWidth: 1,
      borderColor: 'rgba(235,162,78,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    pharmBannerInfo: {
      flex: 1,
      gap: 4,
    },
    pharmBannerName: {
      fontFamily: FontFamily.serif,
      fontSize: 17,
      color: colors.text.primary,
    },
    pharmBannerAddr: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 12,
      color: colors.text.tertiary,
    },
    pharmOpenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    pharmOpenText: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 11.5,
    },
    sectionLabel: {
      fontFamily: FontFamily.sansExtraBold,
      fontSize: 11,
      color: colors.text.tertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
      marginTop: 4,
    },
    methodRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    methodBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 14,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border.glass,
      backgroundColor: colors.bg.card,
      overflow: 'hidden',
    },
    methodBtnActive: {
      borderColor: colors.amber,
    },
    methodLabel: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13.5,
      color: colors.text.tertiary,
    },
    methodLabelActive: {
      color: '#221204',
    },
    uploadBtnRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 20,
    },
    uploadBtn: {
      alignItems: 'center',
      gap: 7,
      paddingVertical: 18,
      paddingHorizontal: 4,
      borderRadius: Radius.lg,
      borderStyle: 'dashed',
      borderColor: 'rgba(235,162,78,0.30)',
      borderWidth: 1.5,
    },
    uploadBtnText: {
      fontFamily: FontFamily.sansBold,
      fontSize: 11,
      color: colors.text.primary,
      textAlign: 'center',
    },
    uploadDone: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: Radius.lg,
      marginBottom: 20,
    },
    thumb: {
      width: 44,
      height: 44,
      borderRadius: 12,
    },
    thumbDoc: {
      backgroundColor: colors.sageSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadDoneInfo: { flex: 1, gap: 2 },
    uploadTitle: {
      fontFamily: FontFamily.sansBold,
      fontSize: 14,
      color: colors.text.primary,
    },
    uploadSub: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 11.5,
      color: colors.text.tertiary,
    },
    removeLink: {
      fontFamily: FontFamily.sansBold,
      fontSize: 12.5,
      color: '#f0a89e',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
      borderRadius: Radius.lg,
    },
    searchInput: {
      flex: 1,
      fontFamily: FontFamily.sansMedium,
      fontSize: 14,
      color: colors.text.primary,
    },
    cartList: {
      gap: 8,
      marginBottom: 16,
    },
    cartItemOut: {
      opacity: 0.55,
    },
    textMuted: {
      color: colors.text.tertiary,
    },
    outBadge: {
      backgroundColor: 'rgba(224,122,107,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(224,122,107,0.25)',
      borderRadius: Radius.pill,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    outBadgeText: {
      fontFamily: FontFamily.sansBold,
      fontSize: 10.5,
      color: '#f0a89e',
    },
    cartItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      borderRadius: Radius.md,
      gap: 10,
    },
    cartItemLeft: {
      flex: 1,
      gap: 3,
    },
    cartItemName: {
      fontFamily: FontFamily.sansBold,
      fontSize: 14,
      color: colors.text.primary,
    },
    cartItemDose: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 12,
      color: colors.text.tertiary,
    },
    cartItemMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 7,
      marginTop: 2,
    },
    rxBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.sageSoft,
      borderWidth: 1,
      borderColor: 'rgba(127,184,158,0.35)',
      borderRadius: Radius.pill,
      paddingVertical: 3,
      paddingHorizontal: 8,
    },
    rxBadgeText: {
      fontFamily: FontFamily.sansBold,
      fontSize: 10,
      color: colors.sageBright,
    },
    stockWarning: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 11,
      color: '#f0a89e',
      marginTop: 2,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.glass,
      borderRadius: Radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    stepperBtn: {
      width: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperBtnText: {
      fontFamily: FontFamily.sansBold,
      fontSize: 15,
      color: colors.amberBright,
    },
    stepperQty: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13,
      color: colors.text.primary,
      minWidth: 16,
      textAlign: 'center',
    },
    emptyText: {
      fontFamily: FontFamily.sans,
      fontSize: 13.5,
      color: colors.text.tertiary,
      textAlign: 'center',
      paddingVertical: 24,
    },
    priceSummary: {
      padding: 16,
      borderRadius: Radius.lg,
      gap: 10,
      marginBottom: 8,
    },
    priceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    priceLabel: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 13.5,
      color: colors.text.secondary,
    },
    priceValue: {
      fontFamily: FontFamily.sansBold,
      fontSize: 13.5,
      color: colors.text.primary,
    },
    priceDivider: {
      height: 1,
      backgroundColor: colors.border.glass,
      marginVertical: 2,
    },
    priceTotalLabel: {
      fontFamily: FontFamily.sansBold,
      fontSize: 15,
      color: colors.text.primary,
    },
    priceTotalValue: {
      fontFamily: FontFamily.serif,
      fontSize: 20,
      color: colors.amberBright,
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: Spacing.xl,
      paddingTop: 12,
      backgroundColor: 'transparent',
    },
    addressWarning: {
      fontFamily: FontFamily.sansMedium,
      fontSize: 12.5,
      color: '#f0a89e',
      textAlign: 'center',
      marginBottom: 10,
    },
    payWithCard: {
      padding: 14,
      borderRadius: Radius.lg,
      marginBottom: 8,
    },
    payWithRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    payWithLabel: {
      flex: 1,
      fontFamily: FontFamily.sansBold,
      fontSize: 14,
      color: colors.text.primary,
    },
    sheetContent: {
      paddingHorizontal: 24,
      paddingBottom: 12,
      gap: 4,
    },
    sheetTitle: {
      fontFamily: FontFamily.serif,
      fontSize: 17,
      color: colors.text.primary,
      marginBottom: 14,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      height: 52,
    },
    sheetRowLabel: {
      flex: 1,
      fontFamily: FontFamily.sansMedium,
      fontSize: 15,
      color: colors.text.primary,
    },
  });
}
