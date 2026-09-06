import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../shared/widgets/custom_text_field.dart';
import '../../domain/entities/hub_parcel.dart';
import '../bloc/parcels_bloc.dart';
import '../bloc/parcels_event.dart';
import '../bloc/parcels_state.dart';

class DeliverParcelPage extends StatefulWidget {
  final HubParcel parcel;
  const DeliverParcelPage({super.key, required this.parcel});
  @override State<DeliverParcelPage> createState() => _DeliverParcelPageState();
}
class _DeliverParcelPageState extends State<DeliverParcelPage> {
  final _otpController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override void dispose() { _otpController.dispose(); super.dispose(); }

  void _onDeliver() {
    if (_formKey.currentState!.validate()) {
      context.read<HubParcelsBloc>().add(DeliverParcelEvent(
        parcelId: widget.parcel.id, otp: _otpController.text,
      ));
    }
  }

  @override Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تحویل به گیرنده')),
      body: BlocConsumer<HubParcelsBloc, HubParcelsState>(
        listener: (context, state) {
          if (state is ParcelDelivered) {
            showDialog(
              context: context,
              barrierDismissible: false,
              builder: (ctx) => AlertDialog(
                title: const Row(children: [Icon(Icons.check_circle, color: Colors.green), SizedBox(width: 8), Text('تحویل موفق')]),
                content: Text('بسته \${widget.parcel.trackingCode} با موفقیت تحویل داده شد.\nهزینه: \${widget.parcel.calculatedFee ?? 0} ریال'),
                actions: [
                  ElevatedButton(
                    onPressed: () { Navigator.pop(ctx); Navigator.pop(context); },
                    child: const Text('بسیار عالی'),
                  )
                ],
              ),
            );
          } else if (state is HubParcelsError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: Colors.red));
          }
        },
        builder: (context, state) {
          return Padding(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    color: Colors.teal.shade50,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('کد رهگیری: \${widget.parcel.trackingCode}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          Text('گیرنده: \${widget.parcel.recipientName}'),
                          Text('تلفن: \${widget.parcel.recipientPhone}'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  CustomTextField(
                    controller: _otpController,
                    labelText: 'کد ۶ رقمی OTP گیرنده',
                    keyboardType: TextInputType.number,
                    validator: (v) {
                      if (v == null || v.length != 6) return 'کد باید ۶ رقم باشد';
                      return null;
                    },
                  ),
                  const SizedBox(height: 24),
                  CustomButton(
                    text: 'تایید و تحویل بسته',
                    onPressed: state is HubParcelsLoading ? null : _onDeliver,
                    isLoading: state is HubParcelsLoading,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
