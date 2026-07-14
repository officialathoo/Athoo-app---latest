import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEGAL_VERSION } from "@/components/ui/LegalAcceptanceCheckbox";
import { AppCard, AppText, ScreenHeader, responsiveContent } from "@/components/design";
import { Icon } from "@/components/ui/Icon";
import { useLang } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

type LegalKind = "privacy" | "terms";
type BilingualSection = { enTitle: string; urTitle: string; enBody: string; urBody: string };

const PRIVACY_SECTIONS: BilingualSection[] = [
  {
    enTitle: "1. Information Athoo collects",
    urTitle: "1۔ اتھو کون سی معلومات جمع کرتا ہے",
    enBody: "Athoo may collect account details, profile information, booking and service records, support messages, device and security information, location used for service workflows, and documents submitted for provider verification or payment evidence.",
    urBody: "اتھو اکاؤنٹ کی تفصیلات، پروفائل معلومات، بکنگ اور سروس ریکارڈ، سپورٹ پیغامات، ڈیوائس اور سیکیورٹی معلومات، سروس کے لیے استعمال ہونے والی لوکیشن، اور فراہم کنندہ کی تصدیق یا ادائیگی کے ثبوت کے لیے جمع کرائی گئی دستاویزات محفوظ کر سکتا ہے۔",
  },
  {
    enTitle: "2. How information is used",
    urTitle: "2۔ معلومات کیسے استعمال ہوتی ہیں",
    enBody: "Information is used to operate accounts, match customers and providers, process bookings and negotiations, support communication, review verification and finance requests, prevent misuse, resolve complaints, improve reliability, and comply with applicable requirements.",
    urBody: "معلومات اکاؤنٹس چلانے، کسٹمر اور فراہم کنندہ کو ملانے، بکنگ اور مذاکرات مکمل کرنے، رابطہ فراہم کرنے، تصدیق اور مالی درخواستوں کا جائزہ لینے، غلط استعمال روکنے، شکایات حل کرنے، سروس بہتر بنانے اور قابلِ اطلاق تقاضے پورے کرنے کے لیے استعمال ہوتی ہیں۔",
  },
  {
    enTitle: "3. Location information",
    urTitle: "3۔ لوکیشن کی معلومات",
    enBody: "Location may be used for nearby service discovery, addresses, service areas, booking arrival, route or live-job features, and safety controls. Athoo should request device permission before accessing precise location.",
    urBody: "لوکیشن قریبی سروسز تلاش کرنے، پتے، سروس ایریا، بکنگ پر آمد، راستہ یا لائیو جاب فیچرز اور حفاظتی کنٹرولز کے لیے استعمال ہو سکتی ہے۔ درست لوکیشن تک رسائی سے پہلے اتھو کو ڈیوائس کی اجازت لینی چاہیے۔",
  },
  {
    enTitle: "4. Documents and media",
    urTitle: "4۔ دستاویزات اور میڈیا",
    enBody: "Identity documents, certificates, selfies, payment screenshots, complaint evidence, and other private uploads are limited to authorized workflows. Users must not upload material they do not have the right to submit.",
    urBody: "شناختی دستاویزات، سرٹیفکیٹس، سیلفیز، ادائیگی اسکرین شاٹس، شکایت کے ثبوت اور دیگر نجی اپ لوڈ صرف مجاز ورک فلو میں استعمال ہوتے ہیں۔ صارف ایسا مواد اپ لوڈ نہ کریں جسے جمع کرانے کا انہیں حق نہ ہو۔",
  },
  {
    enTitle: "5. Sharing and access",
    urTitle: "5۔ معلومات کی شیئرنگ اور رسائی",
    enBody: "Athoo may share only the information needed to complete a service or operate the platform. Private documents and internal records are not intended for public display. Authorized service providers may process information for hosting, messaging, notifications, storage, analytics, or security under appropriate controls.",
    urBody: "اتھو صرف وہ معلومات شیئر کر سکتا ہے جو سروس مکمل کرنے یا پلیٹ فارم چلانے کے لیے ضروری ہوں۔ نجی دستاویزات اور اندرونی ریکارڈ عوامی نمائش کے لیے نہیں ہیں۔ مجاز سروس فراہم کنندگان ہوسٹنگ، پیغام رسانی، نوٹیفکیشن، اسٹوریج، تجزیات یا سیکیورٹی کے لیے مناسب کنٹرولز کے تحت معلومات پراسیس کر سکتے ہیں۔",
  },
  {
    enTitle: "6. Retention and deletion",
    urTitle: "6۔ معلومات محفوظ رکھنے اور حذف کرنے کی پالیسی",
    enBody: "Athoo retains information only as long as needed for platform operations, safety, dispute handling, fraud prevention, legal obligations, and financial or audit records. Users can request account deletion from Privacy & Security, subject to required retention periods.",
    urBody: "اتھو معلومات صرف پلیٹ فارم آپریشن، حفاظت، تنازعات کے حل، فراڈ کی روک تھام، قانونی ذمہ داریوں اور مالی یا آڈٹ ریکارڈ کے لیے ضروری مدت تک محفوظ رکھتا ہے۔ صارف رازداری و سیکیورٹی سے اکاؤنٹ حذف کرنے کی درخواست دے سکتے ہیں، تاہم لازمی ریکارڈ مقررہ مدت تک محفوظ رہ سکتے ہیں۔",
  },
  {
    enTitle: "7. Security",
    urTitle: "7۔ سیکیورٹی",
    enBody: "Athoo uses access controls and technical safeguards intended to protect accounts and stored information. No online system is risk-free, so users should protect passwords and OTP codes, keep devices secure, and report suspicious activity promptly.",
    urBody: "اتھو اکاؤنٹس اور محفوظ معلومات کی حفاظت کے لیے رسائی کنٹرول اور تکنیکی حفاظتی اقدامات استعمال کرتا ہے۔ کوئی آن لائن نظام مکمل طور پر خطرے سے پاک نہیں، اس لیے صارف پاس ورڈ اور OTP محفوظ رکھیں، ڈیوائس کو محفوظ رکھیں اور مشکوک سرگرمی فوراً رپورٹ کریں۔",
  },
  {
    enTitle: "8. Your choices",
    urTitle: "8۔ آپ کے اختیارات",
    enBody: "Users can update profile information, manage device permissions, control notifications through phone settings, change passwords, contact support, review policies, and request account deletion where available.",
    urBody: "صارف پروفائل معلومات اپ ڈیٹ کر سکتے ہیں، ڈیوائس اجازتیں منظم کر سکتے ہیں، فون سیٹنگز سے نوٹیفکیشن کنٹرول کر سکتے ہیں، پاس ورڈ تبدیل کر سکتے ہیں، سپورٹ سے رابطہ کر سکتے ہیں، پالیسیاں دیکھ سکتے ہیں اور دستیاب صورت میں اکاؤنٹ حذف کرنے کی درخواست دے سکتے ہیں۔",
  },
  {
    enTitle: "9. Contact",
    urTitle: "9۔ رابطہ",
    enBody: "For privacy questions or requests, contact Athoo Support from the app so the request can be associated with your verified account and tracked through the support-ticket system.",
    urBody: "رازداری سے متعلق سوال یا درخواست کے لیے ایپ کے اندر اتھو سپورٹ سے رابطہ کریں تاکہ درخواست آپ کے تصدیق شدہ اکاؤنٹ کے ساتھ منسلک اور سپورٹ ٹکٹ سسٹم میں ٹریک ہو سکے۔",
  },
];

const TERMS_SECTIONS: BilingualSection[] = [
  {
    enTitle: "1. Acceptance and eligibility",
    urTitle: "1۔ شرائط کی قبولیت اور اہلیت",
    enBody: "By creating an account or using Athoo, you agree to these Terms and the current Privacy Policy. Users must provide accurate information, be legally able to use the service, and follow applicable laws in Pakistan.",
    urBody: "اکاؤنٹ بنانے یا اتھو استعمال کرنے سے آپ ان شرائط اور موجودہ رازداری پالیسی سے اتفاق کرتے ہیں۔ صارف درست معلومات فراہم کریں، قانونی طور پر سروس استعمال کرنے کے اہل ہوں اور پاکستان کے قابلِ اطلاق قوانین پر عمل کریں۔",
  },
  {
    enTitle: "2. Marketplace role",
    urTitle: "2۔ مارکیٹ پلیس کا کردار",
    enBody: "Athoo provides technology that helps customers and independent service providers discover, communicate, negotiate, book, document, and manage services. Unless expressly stated otherwise, providers are independent and are not Athoo employees.",
    urBody: "اتھو ایسی ٹیکنالوجی فراہم کرتا ہے جو کسٹمر اور آزاد سروس فراہم کنندگان کو سروس تلاش کرنے، رابطہ کرنے، قیمت طے کرنے، بکنگ، ریکارڈ اور انتظام میں مدد دیتی ہے۔ واضح طور پر مختلف نہ بتایا جائے تو فراہم کنندگان آزاد ہیں اور اتھو کے ملازم نہیں۔",
  },
  {
    enTitle: "3. Accounts and security",
    urTitle: "3۔ اکاؤنٹس اور سیکیورٹی",
    enBody: "Users are responsible for keeping passwords, OTP codes, devices, and account access secure. Athoo may restrict simultaneous sessions and may log out an older device when a new device signs in under the same account.",
    urBody: "صارف پاس ورڈ، OTP کوڈ، ڈیوائس اور اکاؤنٹ رسائی محفوظ رکھنے کے ذمہ دار ہیں۔ اتھو بیک وقت سیشن محدود کر سکتا ہے اور اسی اکاؤنٹ سے نئی ڈیوائس پر سائن اِن ہونے کی صورت میں پرانی ڈیوائس کو لاگ آؤٹ کر سکتا ہے۔",
  },
  {
    enTitle: "4. Bookings, offers, and service delivery",
    urTitle: "4۔ بکنگ، پیشکش اور سروس کی فراہمی",
    enBody: "Customers must provide accurate service details, timing, address, and access information. Providers must accept only work they are qualified and available to perform. Material costs, travel charges, hourly rates, fixed offers, and other terms should be agreed through the app before work begins.",
    urBody: "کسٹمر سروس کی درست تفصیل، وقت، پتہ اور رسائی کی معلومات فراہم کریں۔ فراہم کنندہ صرف وہ کام قبول کرے جس کے لیے وہ اہل اور دستیاب ہو۔ سامان کی لاگت، سفری چارجز، فی گھنٹہ شرح، مقررہ پیشکش اور دیگر شرائط کام شروع ہونے سے پہلے ایپ میں طے کی جائیں۔",
  },
  {
    enTitle: "5. Payments, commission, and evidence",
    urTitle: "5۔ ادائیگی، کمیشن اور ثبوت",
    enBody: "Athoo currently supports manual payment workflows unless a live gateway is expressly enabled. Users must submit genuine transaction references and screenshots. Providers are responsible for platform commission shown in the app, and false or duplicate evidence may lead to rejection or account restriction.",
    urBody: "جب تک لائیو گیٹ وے واضح طور پر فعال نہ ہو، اتھو دستی ادائیگی کے ورک فلو استعمال کرتا ہے۔ صارف حقیقی ٹرانزیکشن ریفرنس اور اسکرین شاٹ جمع کریں۔ فراہم کنندہ ایپ میں دکھائے گئے پلیٹ فارم کمیشن کا ذمہ دار ہے، اور جعلی یا دہرایا ہوا ثبوت مسترد یا اکاؤنٹ محدود ہونے کا سبب بن سکتا ہے۔",
  },
  {
    enTitle: "6. Cancellations, complaints, and refunds",
    urTitle: "6۔ منسوخی، شکایات اور رقم واپسی",
    enBody: "Cancellation windows, penalties, refund eligibility, complaint handling, and evidence requirements may depend on the booking status and current platform settings. Users should use the in-app workflow and provide complete, truthful information for review.",
    urBody: "منسوخی کی مدت، جرمانہ، رقم واپسی کی اہلیت، شکایت کے طریقہ کار اور ثبوت کی ضرورت بکنگ اسٹیٹس اور موجودہ پلیٹ فارم سیٹنگز پر منحصر ہو سکتی ہے۔ صارف ایپ کے اندر موجود طریقہ استعمال کریں اور جائزے کے لیے مکمل اور درست معلومات دیں۔",
  },
  {
    enTitle: "7. Conduct and prohibited use",
    urTitle: "7۔ رویہ اور ممنوع استعمال",
    enBody: "Users must not harass, threaten, discriminate, impersonate, defraud, bypass platform safeguards, exchange prohibited content, misuse personal information, submit false documents, manipulate ratings, or use Athoo for unlawful activity.",
    urBody: "صارف ہراسانی، دھمکی، امتیاز، جعل سازی، دھوکہ دہی، پلیٹ فارم حفاظتی نظام کو بائی پاس، ممنوع مواد کا تبادلہ، ذاتی معلومات کا غلط استعمال، جعلی دستاویزات، ریٹنگ میں ہیرا پھیری یا غیر قانونی سرگرمی کے لیے اتھو استعمال نہ کریں۔",
  },
  {
    enTitle: "8. Suspension and termination",
    urTitle: "8۔ معطلی اور اکاؤنٹ ختم کرنا",
    enBody: "Athoo may warn, restrict, suspend, or delete accounts when reasonably necessary for safety, fraud prevention, policy enforcement, legal compliance, repeated inactivity, unpaid obligations, or abuse. Users may contact support to request review where applicable.",
    urBody: "اتھو حفاظت، فراڈ کی روک تھام، پالیسی کے نفاذ، قانونی تقاضوں، مسلسل غیر فعالیت، واجبات کی عدم ادائیگی یا غلط استعمال کی صورت میں مناسب طور پر اکاؤنٹ کو وارننگ، محدود، معطل یا حذف کر سکتا ہے۔ قابلِ اطلاق صورت میں صارف سپورٹ سے جائزے کی درخواست کر سکتے ہیں۔",
  },
  {
    enTitle: "9. Platform availability and liability",
    urTitle: "9۔ پلیٹ فارم کی دستیابی اور ذمہ داری",
    enBody: "Athoo works to provide a reliable service but cannot guarantee uninterrupted availability, successful matching, provider performance, device connectivity, or results from third-party infrastructure. Nothing in these Terms excludes rights that cannot legally be excluded.",
    urBody: "اتھو قابلِ اعتماد سروس فراہم کرنے کی کوشش کرتا ہے مگر مسلسل دستیابی، کامیاب میچنگ، فراہم کنندہ کی کارکردگی، ڈیوائس کنیکٹیویٹی یا تھرڈ پارٹی انفراسٹرکچر کے نتائج کی ضمانت نہیں دیتا۔ ان شرائط میں کوئی بات ایسے قانونی حقوق کو ختم نہیں کرتی جنہیں قانوناً ختم نہیں کیا جا سکتا۔",
  },
  {
    enTitle: "10. Changes and contact",
    urTitle: "10۔ تبدیلیاں اور رابطہ",
    enBody: "Athoo may update these Terms when the product, policies, or legal requirements change. The app may request acceptance of a newer version. For questions, contact Athoo Support through the in-app support-ticket system.",
    urBody: "پروڈکٹ، پالیسی یا قانونی تقاضے تبدیل ہونے پر اتھو ان شرائط کو اپ ڈیٹ کر سکتا ہے۔ ایپ نئی ورژن کی قبولیت مانگ سکتی ہے۔ سوالات کے لیے ایپ کے سپورٹ ٹکٹ سسٹم سے اتھو سپورٹ سے رابطہ کریں۔",
  },
];

export function LegalDocumentScreen({ kind }: { kind: LegalKind }) {
  const { theme } = useTheme();
  const { isUrdu, translate: tr } = useLang();
  const insets = useSafeAreaInsets();
  const title = kind === "privacy" ? tr("Privacy policy") : tr("Terms of service");
  const sections = kind === "privacy" ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScreenHeader title={title} subtitle={tr("Version {{version}}", { version: LEGAL_VERSION })} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, responsiveContent, { paddingBottom: insets.bottom + 44 }]}
      >
        <AppCard elevated={false} style={{ backgroundColor: theme.colors.infoSoft }}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryIcon, { backgroundColor: theme.colors.surface }]}>
              <Icon name={kind === "privacy" ? "shield" : "file-check-2"} size={25} color={theme.colors.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{title}</AppText>
              <AppText variant="caption" tone="secondary" style={styles.summaryCopy}>
                {kind === "privacy"
                  ? tr("This document explains how Athoo handles account, booking, location, document, media, finance, and support information.")
                  : tr("This document explains the rules for using Athoo as a customer or independent service provider.")}
              </AppText>
            </View>
          </View>
        </AppCard>

        {sections.map((section) => (
          <AppCard key={section.enTitle} elevated={false}>
            <AppText variant="bodyStrong">{isUrdu ? section.urTitle : section.enTitle}</AppText>
            <AppText tone="secondary" style={styles.sectionBody}>{isUrdu ? section.urBody : section.enBody}</AppText>
          </AppCard>
        ))}

        <AppText variant="caption" tone="muted" align="center" style={styles.footer}>
          {tr("Current policy version: {{version}}", { version: LEGAL_VERSION })}
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  summaryIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  summaryCopy: { lineHeight: 19, marginTop: 4 },
  sectionBody: { lineHeight: 22, marginTop: 8 },
  footer: { marginVertical: 6 },
});
